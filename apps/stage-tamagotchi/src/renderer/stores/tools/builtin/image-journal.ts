import type { ResolvedArtistryConfig } from '@kitsune/stage-ui/stores/modules/artistry'
import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { artistryGenerateHeadless, errorMessageFromValue } from '@kitsune/stage-shared'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { useBackgroundStore } from '@kitsune/stage-ui/stores/background'
import { usePersonaStore } from '@kitsune/stage-ui/stores/modules/persona'
import { resolveArtistryConfigFromStore, useArtistryStore } from '@kitsune/stage-ui/stores/modules/artistry'
import { rawTool } from '@xsai/tool'

import { widgetsAdd } from '../../../../shared/eventa'

export function getArtistryConfig(): ResolvedArtistryConfig {
  return resolveArtistryConfigFromStore(useArtistryStore())
}

// NOTICE: build the eventa context lazily instead of at module scope. Module-scope
// `getElectronEventaContext()` throws when imported without an Electron IPC bridge
// (unit tests, web runtime), which broke tool definition resolution. Production
// behavior is unchanged: the context is still created once, on first invocation.
let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    generateHeadless: defineInvoke(context, artistryGenerateHeadless),
    addWidget: defineInvoke(context, widgetsAdd),
  }
}

export type ImageJournalInvokers = ReturnType<typeof createInvokers>
let invokeCache: ImageJournalInvokers | undefined

function resolveInvokers(override?: ImageJournalInvokers): ImageJournalInvokers {
  if (override)
    return override
  invokeCache ??= createInvokers()
  return invokeCache
}

const imageJournalParams = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['create', 'apply'],
      description: 'Choose "create" to generate a new image, or "apply" to use an existing one.',
    },
    prompt: {
      type: 'string',
      description: 'Description for the image (required for "create").',
    },
    title: {
      type: 'string',
      description: 'Label for the entry (optional).',
    },
    query: {
      type: 'string',
      description: 'Search term for existing images (required for "apply").',
    },
    mode: {
      type: 'string',
      enum: ['inline', 'widget', 'bg', 'bg_widget'],
      description: 'Display mode: "inline" (in chat), "widget" (overlay), "bg" (environment), or "bg_widget" (both). Defaults to character preference.',
    },
  },
  required: [
    'action',
    'prompt',
    'title',
    'query',
    'mode',
  ],
  additionalProperties: false,
} satisfies JsonSchema

async function executeCreateImageJournalEntry(params: { prompt?: string, title?: string, mode?: 'inline' | 'widget' | 'bg' | 'bg_widget' }, deps?: { invokers?: ImageJournalInvokers }) {
  if (!params.prompt?.trim())
    throw new Error('prompt is required for image_journal.create')

  const backgroundStore = useBackgroundStore()
  const cardStore = usePersonaStore()
  const activeCard = cardStore.activeCard
  const globalArtistryConfig = getArtistryConfig()

  const kitsuneExt = activeCard?.extensions?.kitsune
  const cardArtistry = kitsuneExt?.modules?.artistry
  const artistryConfig = {
    provider: cardArtistry?.provider || globalArtistryConfig.provider,
    model: cardArtistry?.model || globalArtistryConfig.model,
    promptPrefix: cardArtistry?.promptPrefix || globalArtistryConfig.promptPrefix,
    options: cardArtistry?.options || globalArtistryConfig.options,
    globals: globalArtistryConfig.globals,
  }

  const title = params.title || `Generation ${new Date().toLocaleString()}`

  // Resolve mode: explicit param > character fallback > global default (inline)
  const spawnMode = cardArtistry?.spawnMode
  const mode = params.mode || spawnMode || 'inline'

  // 外部网络/生图调用统一超时：任何一环挂起都会让 agent 回合无限期卡住
  // （与截屏 getSources 无超时同类的"话没说完就停"）。
  const IMAGE_JOURNAL_TIMEOUT_MS = 60_000

  const { addWidget, generateHeadless } = resolveInvokers(deps?.invokers)

  try {
    let artistryResult: Awaited<ReturnType<typeof generateHeadless>>
    try {
      artistryResult = await generateHeadless({
        prompt: artistryConfig.promptPrefix ? `${artistryConfig.promptPrefix} ${params.prompt}` : params.prompt as string,
        model: artistryConfig.model as string,
        provider: artistryConfig.provider as string,
        options: JSON.parse(JSON.stringify(artistryConfig.options || {})),
        globals: JSON.parse(JSON.stringify(artistryConfig.globals || {})),
      }, { signal: AbortSignal.timeout(IMAGE_JOURNAL_TIMEOUT_MS) })
    }
    catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
        throw new Error(`图片生成超时（${IMAGE_JOURNAL_TIMEOUT_MS}ms）：生图服务未响应。请重试。`)
      throw error
    }

    if (artistryResult.error || (!artistryResult.base64 && !artistryResult.imageUrl)) {
      throw new Error(`Failed to generate image: ${artistryResult.error || 'No output received'}`)
    }

    let blob: Blob
    if (artistryResult.base64) {
      // 主进程 generateHeadless 返回的 base64 是 data URL（data:image/...;base64,...）。
      // data URL 直接转 Blob，不需要 fetch；裸 base64 一律视为异常，避免
      // fetch('裸base64') 抛 URIError 被静默吞成"生成失败"。
      if (artistryResult.base64.startsWith('data:')) {
        const [, data = ''] = artistryResult.base64.split(',')
        blob = new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' })
      }
      else {
        throw new Error('Image generation returned an invalid base64 payload (missing data: prefix).')
      }
    }
    else {
      const response = await fetch(artistryResult.imageUrl!, { signal: AbortSignal.timeout(IMAGE_JOURNAL_TIMEOUT_MS) })
      if (!response.ok)
        throw new Error(`Failed to download generated image: HTTP ${response.status}`)
      blob = await response.blob()
    }

    const entryId = await backgroundStore.addBackground('journal', blob, title, params.prompt, cardStore.activeCardId)

    // Handle Application Logic based on Mode
    if (mode === 'bg' || mode === 'bg_widget') {
      const cardId = cardStore.activeCardId
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.kitsune)
            extension.kitsune = {}
          if (!extension.kitsune.modules)
            extension.kitsune.modules = {}
          extension.kitsune.modules.activeBackgroundId = entryId
          cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
    }

    if (mode === 'widget' || mode === 'bg_widget') {
      try {
        await addWidget({
          componentName: 'artistry',
          componentProps: {
            status: 'done',
            entryId,
            imageUrl: artistryResult.imageUrl || artistryResult.base64,
            prompt: params.prompt as string,
            title,
            _skipIngestion: true,
          },
          size: 'm',
          ttlMs: 0,
        })
      }
      catch (e) {
        console.warn('[ImageJournalTool] Failed to spawn Result widget', e)
      }
    }

    // Return structured result for UI rendering
    return JSON.stringify({
      message: `Image created in ${mode} mode${mode === 'bg' || mode === 'bg_widget' ? ' and set as background' : ''}.`,
      entryId,
      imageUrl: artistryResult.imageUrl || artistryResult.base64,
      title,
      prompt: params.prompt,
      mode,
    })
  }
  catch (e) {
    console.error('[ImageJournalTool] Failed to create entry', e)
    return `Error: ${errorMessageFromValue(e)}`
  }
}

async function executeSetAsBackground(params: { query?: string }) {
  if (!params.query?.trim())
    return 'Error: query is required for image_journal.apply. Provide a title or ID to search for.'

  const backgroundStore = useBackgroundStore()
  const cardStore = usePersonaStore()
  const cardId = cardStore.activeCardId
  const query = params.query.toLowerCase().trim()

  const entries = Array.from(backgroundStore.entries.values())
    .filter(e => e.characterId === null || e.characterId === cardId)

  let entry = entries.find(e => e.type === 'journal' && (e.id === query || e.id.toLowerCase().includes(query)))
  if (!entry)
    entry = entries.find(e => e.type === 'journal' && e.title.toLowerCase().includes(query))
  if (!entry)
    entry = entries.find(e => e.type !== 'journal' && e.title.toLowerCase().includes(query))

  if (entry) {
    try {
      if (cardId) {
        const card = cardStore.cards.get(cardId)
        if (card) {
          const extension = JSON.parse(JSON.stringify(card.extensions || {}))
          if (!extension.kitsune)
            extension.kitsune = {}
          if (!extension.kitsune.modules)
            extension.kitsune.modules = {}
          extension.kitsune.modules.activeBackgroundId = entry.id
          cardStore.updateCard(cardId, { ...card, extensions: extension })
        }
      }
      return `Background set to "${entry.title}".`
    }
    catch (e) {
      return `Error applying "${entry.title}": ${errorMessageFromValue(e)}`
    }
  }

  const available = entries.filter(e => e.type === 'journal').map(e => e.title).slice(0, 10)
  return `No match for "${params.query}".${available.length > 0 ? ` Try: ${available.join(', ')}` : ''}`
}

export async function executeImageJournalAction(params: any, deps?: { invokers?: ImageJournalInvokers }) {
  if (params.action === 'create') {
    if (!params.prompt?.trim())
      throw new Error('prompt is required for image_journal.create')
    return await executeCreateImageJournalEntry(params, deps)
  }
  if (params.action === 'apply' || params.action === 'set_as_background') {
    if (!params.query?.trim())
      throw new Error('query is required for image_journal.apply')
    return await executeSetAsBackground(params)
  }
  return 'No action performed.'
}

const tools: Promise<Tool>[] = [
  Promise.resolve(rawTool({
    name: 'image_journal',
    description: 'Manage AI-generated images. Use "create" to generate and display images. An optional "mode" (inline, widget, bg, bg_widget) can override the default character routing preference. Use "apply" to switch to an existing image from the journal.',
    execute: params => executeImageJournalAction(params),
    parameters: imageJournalParams,
  })),
]

export const imageJournalTools = async () => Promise.all(tools)
