import { readFile } from 'node:fs/promises'
import { join } from 'path'
import * as yaml from 'yaml'
import { getElectronMainDirname } from '../../../../libs/electron/location'

export interface ProviderConfig {
  type: string
  base_url: string
  model: string
  api_key_env: string
  timeout_ms?: number
  max_completion_tokens?: number
}

const FETCH_RETRY_DELAYS_MS = [1000, 2000, 4000]

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
  provider: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number, type?: string },
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  if (provider.type === 'anthropic') {
    return callAnthropicApi(provider, systemPrompt, userPrompt)
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

  return fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, provider.model)
}

async function callAnthropicApi(
  provider: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number },
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
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
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
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
      console.log(`[llm] Anthropic 200 ${provider.model} → ${text.length} chars`)
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
 * - 网络错误（fetch throw）重试，最多 3 次
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  model: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  let lastError = ''
  for (const [_attempt, delayMs] of FETCH_RETRY_DELAYS_MS.entries()) {
    try {
      const resp = await fetch(url, options)
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
      const data = await resp.json()
      const text = data.choices?.[0]?.message?.content
      if (!text)
        return { ok: false, error: 'LLM 返回空内容' }
      console.log(`[llm] HTTP 200 ${model} → ${text.length} chars`)
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
 * 未同步时才回退到 providers.yaml 静态文件 + 环境变量。
 */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  activeProviderOverride?: { baseUrl: string, model: string, apiKey: string, maxCompletionTokens?: number } | null,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  const syncedConfig = getSyncedProviderConfig()

  if (syncedConfig) {
    const result = await callLlmWithProvider(syncedConfig, systemPrompt, userPrompt)
    if (result.ok)
      return result
    return { ok: false, error: `provider ${syncedConfig.model}: ${result.error}` }
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
    const apiKey = process.env[provider.api_key_env]
    if (!apiKey) {
      errors.push(`${provider.model}: 环境变量 ${provider.api_key_env} 未设置`)
      continue
    }
    const result = await callLlmWithProvider(
      { baseUrl: provider.base_url, model: provider.model, apiKey, maxCompletionTokens: provider.max_completion_tokens, type: provider.type },
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