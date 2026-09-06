import { describe, expect, it, vi, beforeEach } from 'vitest'

// NOTICE: llmHelper.ts 依赖 electron app 路径和文件系统。
// 这里 mock 掉 fs 和 electron 相关模块，只测试纯逻辑部分。

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('../../../../libs/electron/location', () => ({
  getElectronMainDirname: vi.fn().mockReturnValue('/mock/main'),
}))

const mockReadFile = vi.mocked((await import('node:fs/promises')).readFile)

// Mock YAML parse
vi.mock('yaml', () => ({
  parse: vi.fn((raw: string) => {
    // 简单的 YAML 解析 — 直接返回预设的结构
    return JSON.parse(raw)
  }),
}))

// 先导入 fetchWithRetry 的内部逻辑 — 通过测试 callLlm 的降级链
// 由于 callLlm 内部使用 fetch，我们需要 mock globalThis.fetch
const originalFetch = globalThis.fetch

describe('llmHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = originalFetch
  })

  describe('callLlm fallback chain', () => {
    it('returns success from primary provider', async () => {
      // 设置 providers.yaml
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: 'primary',
        providers: {
          primary: {
            type: 'openai',
            base_url: 'https://api.primary.com',
            model: 'gpt-4',
            api_key_env: 'PRIMARY_KEY',
          },
        },
      }))

      process.env.PRIMARY_KEY = 'test-key'

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Hello from primary' } }] }),
      })

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      expect(result.ok).toBe(true)
      expect(result.text).toBe('Hello from primary')
    })

    it('falls back to secondary provider on primary failure', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: 'primary',
        fallback_providers: ['secondary'],
        providers: {
          primary: {
            type: 'openai',
            base_url: 'https://api.primary.com',
            model: 'gpt-4',
            api_key_env: 'PRIMARY_KEY',
          },
          secondary: {
            type: 'openai',
            base_url: 'https://api.secondary.com',
            model: 'gpt-3.5',
            api_key_env: 'SECONDARY_KEY',
          },
        },
      }))

      process.env.PRIMARY_KEY = 'test-key'
      process.env.SECONDARY_KEY = 'test-key-2'

      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return { ok: false, status: 500, text: async () => 'Server Error', headers: new Map() }
        }
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'Hello from secondary' } }] }),
        }
      })

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      expect(result.ok).toBe(true)
      expect(result.text).toBe('Hello from secondary')
    })

    it('returns error when all providers fail', async () => {
      // callLlm retries with real setTimeout backoff (1s+2s+4s = 7s total),
      // which exceeds Vitest's 5s default timeout. Fast-forward the sleeps.
      vi.useFakeTimers()
      try {
        mockReadFile.mockResolvedValue(JSON.stringify({
          active_provider: 'primary',
          providers: {
            primary: {
              type: 'openai',
              base_url: 'https://api.primary.com',
              model: 'gpt-4',
              api_key_env: 'PRIMARY_KEY',
            },
          },
        }))

        process.env.PRIMARY_KEY = 'test-key'

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Server Error',
          headers: new Map(),
        })

        const { callLlm } = await import('./llmHelper')
        const resultPromise = callLlm('system', 'user')
        // FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000]
        await vi.advanceTimersByTimeAsync(7000)
        const result = await resultPromise

        expect(result.ok).toBe(false)
        expect(result.error).toContain('所有 provider 均失败')
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('returns error when no providers configured', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: undefined,
        providers: {},
      }))

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      expect(result.ok).toBe(false)
      expect(result.error).toContain('providers.yaml 未配置')
    })

    it('returns error when API key is missing', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: 'primary',
        providers: {
          primary: {
            type: 'openai',
            base_url: 'https://api.primary.com',
            model: 'gpt-4',
            api_key_env: 'NONEXISTENT_KEY',
          },
        },
      }))

      delete process.env.NONEXISTENT_KEY

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      expect(result.ok).toBe(false)
      expect(result.error).toContain('未设置')
    })
  })

  describe('fetchWithRetry behavior (via callLlm)', () => {
    it('does not retry on 4xx errors', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: 'primary',
        providers: {
          primary: {
            type: 'openai',
            base_url: 'https://api.primary.com',
            model: 'gpt-4',
            api_key_env: 'PRIMARY_KEY',
          },
        },
      }))

      process.env.PRIMARY_KEY = 'test-key'

      let fetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++
        return { ok: false, status: 401, text: async () => 'Unauthorized', headers: new Map() }
      })

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      // 4xx should not retry — only 1 fetch call
      expect(fetchCount).toBe(1)
      expect(result.ok).toBe(false)
    })

    it('retries on 5xx errors up to 3 times', async () => {
      // callLlm retries with real setTimeout backoff (1s+2s+4s = 7s total),
      // which exceeds Vitest's 5s default timeout. Fast-forward the sleeps.
      vi.useFakeTimers()
      try {
        mockReadFile.mockResolvedValue(JSON.stringify({
          active_provider: 'primary',
          providers: {
            primary: {
              type: 'openai',
              base_url: 'https://api.primary.com',
              model: 'gpt-4',
              api_key_env: 'PRIMARY_KEY',
            },
          },
        }))

        process.env.PRIMARY_KEY = 'test-key'

        let fetchCount = 0
        globalThis.fetch = vi.fn().mockImplementation(async () => {
          fetchCount++
          return { ok: false, status: 503, text: async () => 'Service Unavailable', headers: new Map() }
        })

        const { callLlm } = await import('./llmHelper')
        const resultPromise = callLlm('system', 'user')
        // FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000]
        await vi.advanceTimersByTimeAsync(7000)
        const result = await resultPromise

        // Should retry 3 times (RETRY_DELAYS_MS has 3 entries)
        expect(fetchCount).toBe(3)
        expect(result.ok).toBe(false)
        expect(result.error).toContain('重试 3 次均失败')
      }
      finally {
        vi.useRealTimers()
      }
    })

    it('retries on network errors', async () => {
      // callLlm retries with real setTimeout backoff (1s+2s+4s = 7s total),
      // which exceeds Vitest's 5s default timeout. Fast-forward the sleeps.
      vi.useFakeTimers()
      try {
        mockReadFile.mockResolvedValue(JSON.stringify({
          active_provider: 'primary',
          providers: {
            primary: {
              type: 'openai',
              base_url: 'https://api.primary.com',
              model: 'gpt-4',
              api_key_env: 'PRIMARY_KEY',
            },
          },
        }))

        process.env.PRIMARY_KEY = 'test-key'

        let fetchCount = 0
        globalThis.fetch = vi.fn().mockImplementation(async () => {
          fetchCount++
          throw new Error('fetch failed')
        })

        const { callLlm } = await import('./llmHelper')
        const resultPromise = callLlm('system', 'user')
        // FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000]
        await vi.advanceTimersByTimeAsync(7000)
        const result = await resultPromise

        expect(fetchCount).toBe(3)
        expect(result.ok).toBe(false)
      }
      finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Anthropic provider format', () => {
    it('uses Anthropic API format for anthropic type', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        active_provider: 'primary',
        providers: {
          primary: {
            type: 'anthropic',
            base_url: 'https://api.anthropic.com',
            model: 'claude-3',
            api_key_env: 'ANTHROPIC_KEY',
          },
        },
      }))

      process.env.ANTHROPIC_KEY = 'test-key'

      let capturedUrl: string | undefined
      let capturedOptions: RequestInit | undefined
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedUrl = url
        capturedOptions = options
        return {
          ok: true,
          json: async () => ({ content: [{ text: 'Hello from Claude' }] }),
        }
      })

      const { callLlm } = await import('./llmHelper')
      const result = await callLlm('system', 'user')

      expect(result.ok).toBe(true)
      expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
      const body = JSON.parse(capturedOptions?.body as string)
      expect(body.model).toBe('claude-3')
      expect(body.system).toBe('system')
      // Anthropic uses x-api-key header
      expect(capturedOptions?.headers).toHaveProperty('x-api-key', 'test-key')
    })
  })
})
