import type { StreamOptions } from '@kitsune/core-agent'
import type { WebSocketEvents } from '@kitsune/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { streamFrom as coreStreamFrom, isContentArrayRelatedError, isToolRelatedError, modelKey } from '@kitsune/core-agent'
import { listModels } from '@xsai/model'
import { uniqBy } from 'es-toolkit'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { showRouterStatus } from '../composables/use-router-status'
import { createSparkCommandTool, debug, mcp } from '../tools'
import { useLlmRouter } from './llm-router'
import { useProvidersStore } from './providers'
import { useLlmToolsStore } from './llm-tools'
import { useModsServerChannelStore } from './mods/api/channel-server'

export type { StreamEvent, StreamOptions } from '@kitsune/core-agent'
export { isContentArrayRelatedError, isToolRelatedError } from '@kitsune/core-agent'

function toolNameFrom(tool: Tool) {
  const candidate = tool as Tool & {
    name?: string
    function?: {
      name?: string
    }
  }

  return candidate.function?.name ?? candidate.name
}

// 渲染进程 fetch 直连中转会撞 CORS（带 Authorization 的跨域请求被预检 401 拦截）。
// 这里给 chatProvider 注入一个走主进程代理的 fetch：主进程 Node fetch 无 CORS 限制。
// @xsai/shared-chat 的 chat() 优先读 options.fetch，streamText 透传 chatConfig 字段。
// 通道用裸 ipcMain.handle('llm-proxy-fetch:invoke') + JSON 字符串，与 desktop-automation:invoke 同款
// （绕开 eventa 序列化问题；stage-ui 不依赖 app 包内 shared/eventa）。
function makeIpcFetchProxy() {
  // 测试/非 Electron 环境（node 下无 window）直接走原始 fetch；window.electron 未注入
  // 时也返回 undefined，由 withIpcFetchFallback 原样透传 chatProvider。
  const electronApi = (typeof window === 'undefined' ? undefined : (window as { electron?: { ipcRenderer?: { invoke(channel: string, ...args: unknown[]): Promise<unknown> } } }).electron)
  const ipc = electronApi?.ipcRenderer
  if (!ipc)
    return undefined
  const proxyFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : (input instanceof Request ? input.url : String(input))
    const reqInit = {
      method: init?.method,
      headers: (init?.headers as Record<string, string> | undefined),
      body: init?.body,
    }
    const raw = await ipc.invoke('llm-proxy-fetch:invoke', JSON.stringify({ url, init: reqInit }))
    const res = (typeof raw === 'string' ? JSON.parse(raw) : raw) as
      | { status: number, statusText: string, headers: Record<string, string>, body: string }
      | undefined
    if (!res)
      throw new Error('LLM proxy fetch 无响应')
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
  return proxyFetch
}

function withIpcFetchFallback(chatProvider: ChatProvider): ChatProvider {
  const ipcFetch = makeIpcFetchProxy()
  if (!ipcFetch)
    return chatProvider

  const originalChat = chatProvider.chat.bind(chatProvider)
  return {
    ...chatProvider,
    chat: (model: string) => ({
      ...originalChat(model),
      fetch: ipcFetch,
    }),
  }
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const contentArrayCompatibility = ref<Map<string, boolean>>(new Map())
  const modsServerChannelStore = useModsServerChannelStore()
  const llmToolsStore = useLlmToolsStore()

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    // TODO(audit): don't register the command callback on every stream — hoist registration per provider/session (llm.ts, @nekomeowww,@shinohara-rin)
    const sendSparkCommand = (command: WebSocketEvents['spark:command']) => {
      // TODO(audit): instruct the LLM to understand what destination is — without skill-like prompt injection destinations are wrong/hallucinated (llm.ts, @nekomeowww)
      // Currently without skill like prompt injection, many issues occur.
      // destination mostly are wrong or hallucinated, we need to find a way to make it more reliable.
      //
      // For now, since destinations as array will always broadcast to all connected modules/agents, we can set it to
      // empty array to avoid wrong routing.
      command.destinations = []

      modsServerChannelStore.send({
        type: 'spark:command',
        data: command,
      })
    }

    const builtinToolsResolver = async () => {
      await llmToolsStore.awaitPendingRegistrations()

      // Reverse twice so later runtime registrations win while original tool order stays stable.
      return uniqBy(
        [
          ...await mcp(),
          ...await debug(),
          ...await createSparkCommandTool({ sendSparkCommand }),
          ...await llmToolsStore.activeTools,
        ].toReversed(),
        tool => toolNameFrom(tool) ?? tool,
      ).toReversed()
    }

    const runStream = () => coreStreamFrom({
      model,
      chatProvider: withIpcFetchFallback(chatProvider),
      messages,
      options: {
        ...options,
        toolsCompatibility: toolsCompatibility.value,
        contentArrayCompatibility: contentArrayCompatibility.value,
      },
      builtinToolsResolver,
    })

    try {
      await runStream()
    }
    catch (err) {
      // Auto-fallback: if current provider is local and fails, retry with cloud
      try {
        const llmRouter = useLlmRouter()
        const lastDecision = llmRouter.lastDecision
        if (lastDecision?.target === 'local') {
          const fallback = llmRouter.findCloudFallback(lastDecision.providerId)
          if (fallback) {
            const providersStore = useProvidersStore()
            const meta = providersStore.providerMetadata[fallback.providerId]

            console.warn(`[llm] Local provider failed, falling back to cloud provider "${fallback.providerId}"`)
            showRouterStatus(`本地模型不可用，已切换至 ${meta?.name || fallback.providerId}`)

            const fallbackInstance = await providersStore.getProviderInstance(fallback.providerId) as ChatProvider
            const fallbackModel = fallback.model || model
            const fallbackKey = modelKey(fallbackModel, fallbackInstance)

            // Reset compatibility maps for the fallback provider
            toolsCompatibility.value.delete(fallbackKey)
            contentArrayCompatibility.value.delete(fallbackKey)

            const fallbackStream = () => coreStreamFrom({
              model: fallbackModel,
              chatProvider: fallbackInstance,
              messages,
              options: {
                ...options,
                toolsCompatibility: toolsCompatibility.value,
                contentArrayCompatibility: contentArrayCompatibility.value,
              },
              builtinToolsResolver,
            })

            await fallbackStream()
            return
          }
        }
      }
      catch (fallbackErr) {
        console.error('[llm] Cloud fallback also failed:', fallbackErr)
      }

      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value.set(key, false)
      }
      // NOTICE:
      // Auto-degrade content-part arrays to plain strings on the next attempt
      // when the provider returned the Rust/serde-style "expected a string"
      // 400. We retry once inline so the user's failing turn recovers without
      // requiring them to resend; subsequent calls reuse the cached degrade.
      // NOTICE: 原项目历史链接，待 Kitsune 仓库确定后更新
      // See: https://github.com/moeru-ai/airi/issues/1500
      if (isContentArrayRelatedError(err) && contentArrayCompatibility.value.get(key) !== false) {
        console.warn(`[llm] Auto-disabling content-part arrays for "${key}" and retrying once`)
        contentArrayCompatibility.value.set(key, false)
        await runStream()
        return
      }
      throw err
    }
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '')
      return []

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`))
        return []
      throw err
    }
  }

  return {
    models,
    stream,
  }
})
