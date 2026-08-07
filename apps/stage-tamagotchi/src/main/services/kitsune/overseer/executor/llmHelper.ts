import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as yaml from 'yaml'
import { getElectronMainDirname } from '../../../../libs/electron/location'

interface ProviderConfig {
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

/** 调单个 provider 一次非流式 chat completion，含网络重试 */
async function callLlmWithProvider(
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  const apiKey = process.env[provider.api_key_env]
  if (!apiKey)
    return { ok: false, error: `环境变量 ${provider.api_key_env} 未设置` }

  const isAnthropic = provider.type === 'anthropic'
  const url = isAnthropic
    ? `${provider.base_url}/v1/messages`
    : `${provider.base_url}/chat/completions`
  const body = isAnthropic
    ? { model: provider.model, max_tokens: provider.max_completion_tokens ?? 4096, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }
    : { model: provider.model, max_tokens: provider.max_completion_tokens ?? 4096, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }
  const headers: Record<string, string> = isAnthropic
    ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
    : { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' }

  return fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, isAnthropic, provider.model)
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
  isAnthropic: boolean,
  model: string,
): Promise<{ ok: boolean, text?: string, error?: string }> {
  let lastError = ''
  for (const [_attempt, delayMs] of FETCH_RETRY_DELAYS_MS.entries()) {
    try {
      const resp = await fetch(url, options)
      // 4xx（除 429）不重试
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        const errText = await resp.text().catch(() => '')
        return { ok: false, error: `LLM HTTP ${resp.status}: ${errText.slice(0, 200)}` }
      }
      // 5xx / 429 重试 — 尊重 Retry-After 头
      if (!resp.ok) {
        lastError = `LLM HTTP ${resp.status}`
        const retryAfter = resp.headers.get('retry-after')
        const waitMs = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, delayMs) : delayMs
        await sleep(waitMs)
        continue
      }
      // 成功
      const data = await resp.json()
      const text = isAnthropic ? data.content?.[0]?.text : data.choices?.[0]?.message?.content
      if (!text)
        return { ok: false, error: 'LLM 返回空内容' }
      console.log(`[llm] HTTP 200 ${model} → ${text.length} chars`)
      return { ok: true, text }
    }
    catch (err) {
      // 网络错误重试
      lastError = `网络错误: ${err instanceof Error ? err.message : String(err)}`
      await sleep(delayMs)
    }
  }
  return { ok: false, error: `重试 3 次均失败：${lastError}` }
}

/** 调云端 LLM 非流式 chat completion，支持 primary + fallback 降级链 */
export async function callLlm(systemPrompt: string, userPrompt: string): Promise<{ ok: boolean, text?: string, error?: string }> {
  const primary = await loadActiveProvider()
  const fallbacks = await loadFallbackProviders()
  const providers = [primary, ...fallbacks].filter((p): p is ProviderConfig => p != null)

  if (providers.length === 0)
    return { ok: false, error: 'providers.yaml 未配置 active_provider' }

  const errors: string[] = []
  for (const provider of providers) {
    const result = await callLlmWithProvider(provider, systemPrompt, userPrompt)
    if (result.ok)
      return result
    errors.push(`${provider.model}: ${result.error}`)
  }
  return { ok: false, error: `所有 provider 均失败：${errors.join(' | ')}` }
}