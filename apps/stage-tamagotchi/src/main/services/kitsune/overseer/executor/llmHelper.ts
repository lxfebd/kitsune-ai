import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'path'
import * as yaml from 'yaml'
import { useLogg } from '@guiiai/logg'
import { getElectronMainDirname } from '../../../../libs/electron/location'

const log = useLogg('main/llm-helper').useGlobalConfig()

// LLM usage 统计回调 — 由 token-usage 服务装配时注入，抽取到每条成功响应的 usage 字段
let usageReporter: ((usage: { promptTokens?: number, completionTokens?: number, model?: string }) => void) | null = null
export function setUsageReporter(reporter: (usage: { promptTokens?: number, completionTokens?: number, model?: string }) => void): void {
  usageReporter = reporter
}

function reportUsage(model: string | undefined, usage: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number } | undefined) {
  if (!usageReporter || !usage)
    return
  usageReporter({
    model: model ?? undefined,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  })
}

/**
 * 读 Windows 用户级环境变量（注册表 HKCU\Environment，与资源管理器/新终端一致）。
 * dev 从旧终端启动时 process.env 快照不含后加的用户变量；跨平台（非 win32）直接返回 undefined。
 */
function readUserEnv(name: string): string | undefined {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000,
    })
    // 输出形如: "  ZCODE_RELAY_API_KEY    REG_SZ    sk-xxx"
    const m = out.match(/REG_(?:EXPAND_)?SZ\s+(\S+.*)$/m)
    return m?.[1]?.trim() || undefined
  }
  catch {
    return undefined
  }
}

export interface ProviderConfig {
  type: string
  base_url: string
  model: string
  api_key_env: string
  timeout_ms?: number
  max_completion_tokens?: number
}

const FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000]

// 兜底超时：providers.yaml 未配置 timeout_ms 时给每个 LLM fetch 加 60s 上限。
// 之前 fetch 无 signal，provider 挂起时整个 agent 回合会无限期卡住（与截屏
// getSources 无超时同类）。超时错误走重试循环，最后一次仍失败才返回。
const DEFAULT_LLM_TIMEOUT_MS = 60_000

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
interface ProvidersYaml {
  active_provider?: string
  fallback_providers?: string[]
  providers?: Record<string, ProviderConfig>
}

function getConfigDir(): string {
  const mainDir = getElectronMainDirname()
  const root = join(mainDir, '..', '..', '..', '..')
  const profile = process.env.KITSUNE_PROFILE || 'default'
  return join(root, 'config', profile)
}

async function loadActiveProvider(): Promise<ProviderConfig | null> {
  const raw = await readFile(join(getConfigDir(), 'providers.yaml'), 'utf-8')
  const parsed = yaml.parse(raw) as ProvidersYaml
  const activeId = parsed.active_provider
  if (!activeId || !parsed.providers)
    return null
  return parsed.providers[activeId] ?? null
}

async function loadFallbackProviders(): Promise<ProviderConfig[]> {
  const raw = await readFile(join(getConfigDir(), 'providers.yaml'), 'utf-8')
  const parsed = yaml.parse(raw) as ProvidersYaml
  if (!parsed.fallback_providers || !parsed.providers) return []
  return parsed.fallback_providers
    .map(id => parsed.providers![id])
    .filter((p): p is ProviderConfig => p != null)
}

function callLlmWithProvider(
  provider: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number, type?: string, timeoutMs?: number },
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  const timeoutMs = provider.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS

  if (provider.type === 'anthropic') {
    return callAnthropicApi({ ...provider, timeoutMs }, systemPrompt, userPrompt)
  }

  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const body = {
    model: provider.model,
    max_tokens: provider.maxCompletionTokens ?? 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${provider.apiKey}`,
    'content-type': 'application/json',
  }

  return fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, provider.model, timeoutMs)
}

async function callAnthropicApi(
  provider: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number, timeoutMs?: number },
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  const timeoutMs = provider.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`
  const body = {
    model: provider.model,
    max_tokens: provider.maxCompletionTokens ?? 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }
  const headers: Record<string, string> = {
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }

  let lastError = ''
  for (const [_attempt, delayMs] of FETCH_RETRY_DELAYS_MS.entries()) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        const errText = await resp.text().catch(() => '')
        return { ok: false, error: `Anthropic HTTP ${resp.status}: ${errText.slice(0, 200)}` }
      }
      if (!resp.ok) {
        lastError = `Anthropic HTTP ${resp.status}`
        const retryAfter = resp.headers.get('retry-after')
        const waitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, delayMs) : delayMs
        await sleep(waitMs)
        continue
      }
      const data = await resp.json()
      const text = data.content?.[0]?.text
      if (!text)
        return { ok: false, error: 'Anthropic 返回空内容' }
      log.log(`Anthropic 200 ${provider.model} → ${text.length} chars`)
      // Anthropic Messages API 的 usage 在顶层 usage 字段（input_tokens / output_tokens）
      reportUsage(provider.model, {
        prompt_tokens: data.usage?.input_tokens,
        completion_tokens: data.usage?.output_tokens,
      })
      return { ok: true, text }
    }
    catch (err) {
      lastError = `网络错误: ${err instanceof Error ? err.message : String(err)}`
      await sleep(delayMs)
    }
  }
  return { ok: false, error: `重试 3 次均失败：${lastError}` }
}

/**
 * 带网络重试的 fetch 封装。
 *
 * 重试策略：
 * - 4xx（除 429）不重试，直接返回错误
 * - 5xx / 429 重试，最多 3 次（指数退避 1s/2s/4s）
 * - 网络错误（fetch throw，含超时）重试，最多 3 次
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  model: string,
  timeoutMs: number,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  let lastError = ''
  for (const [_attempt, delayMs] of FETCH_RETRY_DELAYS_MS.entries()) {
    try {
      // AbortSignal.timeout 保证单个 LLM 请求不会无限期挂起回合（见 DEFAULT_LLM_TIMEOUT_MS）。
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        const errText = await resp.text().catch(() => '')
        return { ok: false, error: `LLM HTTP ${resp.status}: ${errText.slice(0, 200)}` }
      }
      if (!resp.ok) {
        lastError = `LLM HTTP ${resp.status}`
        const retryAfter = resp.headers.get('retry-after')
        const waitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, delayMs) : delayMs
        await sleep(waitMs)
        continue
      }
            let data: any
      try {
        // 统一先读 text() 再解析：部分中转站（one-api/new-api 风格）在 JSON 响应后
        // 追加 `data: [DONE]`，直接 resp.json() 会失败，且失败后 body 已被消费，
        // 后续 text() 会拿到空串。这里一次读入，剥离 SSE 尾巴后解析。
        const raw = await resp.text()
        const cleaned = raw.replace(/\ndata: \[DONE\]\s*$/, '').trim()
        data = cleaned ? JSON.parse(cleaned) : null
      }
      catch (parseErr) {
        lastError = `解析响应失败: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
        await sleep(delayMs)
        continue
      }
      if (!data) {
        lastError = 'LLM 响应为空'
        await sleep(delayMs)
        continue
      }
      const text = data.choices?.[0]?.message?.content
      if (!text)
        return { ok: false, error: 'LLM 返回空内容' }
      log.log(`HTTP 200 ${model} → ${text.length} chars`)
      // OpenAI 兼容 / 中转站响应在顶层 usage 字段（prompt_tokens / completion_tokens / total_tokens）
      reportUsage(model, data.usage)
      return { ok: true, text }
    }
    catch (err) {
      lastError = `网络错误: ${err instanceof Error ? err.message : String(err)}`
      await sleep(delayMs)
    }
  }
  return { ok: false, error: `重试 3 次均失败：${lastError}` }
}

/**
 * 调云端 LLM 非流式 chat completion。
 *
 * 优先使用 renderer 同步过来的聊天 provider 配置（含 API key），
 * 该 provider 失败时回退到 providers.yaml 静态文件 + 环境变量（兜底）。
 */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  activeProviderOverride?: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number, timeoutMs?: number } | null,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  const syncedConfig = getSyncedProviderConfig()

  if (syncedConfig) {
    const result = await callLlmWithProvider(syncedConfig, systemPrompt, userPrompt)
    if (result.ok)
      return result
    // 同步的聊天 provider 失败时不直接放弃，继续走 providers.yaml 兜底
  }

  if (activeProviderOverride) {
    const result = await callLlmWithProvider(activeProviderOverride, systemPrompt, userPrompt)
    if (result.ok)
      return result
    return { ok: false, error: `provider ${activeProviderOverride.model}: ${result.error}` }
  }

  const primary = await loadActiveProvider()
  const fallbacks = await loadFallbackProviders()
  const providers = [primary, ...fallbacks].filter((p): p is ProviderConfig => p != null)

  if (providers.length === 0)
    return { ok: false, error: 'providers.yaml 未配置 active_provider' }

  const errors: string[] = []
  for (const provider of providers) {
    // 兜底：进程环境缺 key 时回退读用户级环境变量（Windows 注册表 HKCU\Environment）。
    // dev 从旧终端启动时 process.env 不含后加的用户变量，直接 401/KeyError
    // 「生成计划没动静」的根因之一——第一次成功、之后失败也源于此。
    const apiKey = process.env[provider.api_key_env]
      ?? (process.platform === 'win32' ? readUserEnv(provider.api_key_env) : undefined)
    if (!apiKey) {
      errors.push(`${provider.model}: 环境变量 ${provider.api_key_env} 未设置`)
      continue
    }
    const result = await callLlmWithProvider(
      { baseUrl: provider.base_url, model: provider.model, apiKey, maxCompletionTokens: provider.max_completion_tokens, type: provider.type, timeoutMs: provider.timeout_ms },
      systemPrompt,
      userPrompt,
    )
    if (result.ok)
      return result
    errors.push(`${provider.model}: ${result.error}`)
  }
  return { ok: false, error: `所有 provider 均失败：${errors.join(' | ')}` }
}

let syncedProviderConfig: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number } | null = null

export function setSyncedProviderConfig(config: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number } | null): void {
  syncedProviderConfig = config
}

function getSyncedProviderConfig(): { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number } | null {
  return syncedProviderConfig
}