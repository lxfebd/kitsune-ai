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

type Invokers = ReturnType<typeof createInvokers>
let invokeCache: Invokers | undefined

function getInvokers(): Invokers {
  if (!invokeCache)
    invokeCache = createInvokers()
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

async function executeCreateImageJournalEntry(params: { prompt?: string, title?: string, mode?: 'inline' | 'widget' | 'bg' | 'bg_widget' }) {
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

  const { addWidget, generateHeadless } = getInvokers()

  try {
    const artistryResult = await generateHeadless({
      prompt: artistryConfig.promptPrefix ? `${artistryConfig.promptPrefix} ${params.prompt}` : params.prompt as string,
      model: artistryConfig.model as string,
      provider: artistryConfig.provider as string,
      options: JSON.parse(JSON.stringify(artistryConfig.options || {})),
      globals: JSON.parse(JSON.stringify(artistryConfig.globals || {})),
    })

    if (artistryResult.error || (!artistryResult.base64 && !artistryResult.imageUrl)) {
      throw new Error(`Failed to generate image: ${artistryResult.error || 'No output received'}`)
    }

    let blob: Blob
    if (artistryResult.base64) {
      const response = await fetch(artistryResult.base64)
      blob = await response.blob()
    }
    else {
      const response = await fetch(artistryResult.imageUrl!)
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

async function executeImageJournalAction(params: any) {
  if (params.action === 'create') {
    if (!params.prompt?.trim())
      throw new Error('prompt is required for image_journal.create')
    return await executeCreateImageJournalEntry(params)
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
