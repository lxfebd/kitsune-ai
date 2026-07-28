import type { Card, ccv3 } from '@kitsune/ccc'

import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { watchDebounced } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { isStageTamagotchi } from '@kitsune/stage-shared'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT } from '../../constants/prompts/character-defaults'
import { capturePosthogEvent } from '../analytics/posthog'
import { useSettingsStageModel } from '../settings/stage-model'
import { useArtistryStore } from './artistry'
import { useActiveModelStore } from './active-model'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

export type VoicePackParams = Record<string, string | number | boolean | null>

export interface VoicePackBindingInput {
  id: string
  name: string
  provider: string
  model: string
  voiceId: string
  ttsModelId: string
  params: VoicePackParams
  costMultiplier: number
}

export interface VoicePackSnapshot {
  packId: string
  name: string
  provider: string
  model: string
  voiceId: string
  ttsModelId: string
  params: VoicePackParams
  costMultiplier: number
}

export interface KitsuneExtension {
  modules: {
    consciousness: {
      provider: string // Example: "openai"
      model: string // Example: "gpt-4o"
    }

    vision: {
      provider: string // Example: "ollama"
      model: string // Example: "llava"
    }

    speech: {
      provider: string // Example: "elevenlabs"
      model: string // Example: "eleven_multilingual_v2"
      voice_id: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
      voicePack?: VoicePackSnapshot
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
    }

    // ID from display-models store (e.g. 'preset-live2d-1', 'display-model-<nanoid>')
    displayModelId?: string
    activeBackgroundId?: string

    artistry?: {
      enabled?: boolean
      provider?: string
      model?: string
      promptPrefix?: string
      workflowId?: string
      widgetInstruction?: string
      spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget'
      options?: Record<string, any>
      autonomousEnabled?: boolean
      autonomousThreshold?: number
      autonomousTarget?: 'user' | 'assistant'
    }

    // Persona system (bridged from kitsune-persona)
    persona?: {
      /**人格模式: rational | idol | hybrid | strict */
      mode?: 'rational' | 'idol' | 'hybrid' | 'strict'
      /** 角色灵魂 — 核心人格定义 */
      soul?: string
      /** 角色身份 — 行为准则和说话风格 */
      identity?: string
      /** 称呼设置 */
      addressing?: {
        defaultUserTitle?: string
        customName?: string
        useCustomFirst?: boolean
      }
      /** 引导设置 */
      guidance?: {
        promptIfMissingName?: boolean
        remindCooldownHours?: number
      }
    }

    // Character model/voice/expressions (bridged from core-character)
    character?: {
      voice?: {
        adapter: string
        voiceId: string
        speed?: number
        pitch?: number
        volume?: number
      }
      model?: {
        engine: 'live2d' | 'spine' | 'three'
        source: string
        scale?: number
        offset?: { x: number; y: number }
        initialMotion?: string
        initialExpression?: string
      }
      expressions?: Array<{
        emotion: string
        live2dExpression?: string
        spineAnimation?: string
        vrmExpression?: string
      }>
      tags?: string[]
    }
  }

  agents: {
    [key: string]: { // example: minecraft
      prompt: string
      enabled?: boolean
    }
  }
}

export interface KitsuneCard extends Card {
  extensions: {
    kitsune: KitsuneExtension
  } & Card['extensions']
}

/** @deprecated Use KitsuneCard instead. Kept for type-level backward compatibility. */
export type AiriCard = KitsuneCard
/** @deprecated Use KitsuneExtension instead. Kept for type-level backward compatibility. */
export type AiriExtension = KitsuneExtension

/**
 * Migrates persisted character cards from the legacy `extensions.airi` key to `extensions.kitsune`.
 * Runs once at store init; harmless on already-migrated data.
 */
function migrateCardExtensions(cards: ReturnType<typeof useLocalStorageManualReset<Map<string, KitsuneCard>>>) {
  cards.value.forEach((card, id) => {
    const ext = card.extensions as Record<string, unknown> | undefined
    if (!ext?.airi || ext.kitsune)
      return
    const { airi, ...rest } = ext
    cards.value.set(id, { ...card, extensions: { ...rest, kitsune: airi } })
  })
}

export const usePersonaStore = defineStore('persona', () => {
  const { t } = useI18n()

  const cards = useLocalStorageManualReset<Map<string, KitsuneCard>>('kitsune-cards', new Map())
  const activeCardId = useLocalStorageManualReset<string>('kitsune-card-active-id', 'default')

  // One-shot migration: rename legacy `extensions.airi` to `extensions.kitsune` on persisted cards
  migrateCardExtensions(cards)

  const activeCard = computed(() => cards.value.get(activeCardId.value))

  const activeModelStore = useActiveModelStore()
  const visionStore = useVisionStore()
  const speechStore = useSpeechStore()
  const artistryStore = useArtistryStore()
  const stageModelStore = useSettingsStageModel()

  const {
    activeProvider: activeConsciousnessProvider,
    activeModel: activeConsciousnessModel,
  } = storeToRefs(activeModelStore)

  const {
    activeProvider: activeVisionProvider,
    activeModel: activeVisionModel,
  } = storeToRefs(visionStore)

  const {
    activeSpeechProvider,
    activeSpeechVoiceId,
    activeSpeechModel,
  } = storeToRefs(speechStore)

  const addCard = (card: KitsuneCard | Card | ccv3.CharacterCardV3) => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newKitsuneCard(card))
    return newCardId
  }

  const removeCard = (id: string) => {
    cards.value.delete(id)
    capturePosthogEvent('character_deleted', { character_id: id })
  }

  const updateCard = (id: string, updates: KitsuneCard | Card | ccv3.CharacterCardV3) => {
    const existingCard = cards.value.get(id)
    if (!existingCard)
      return false

    const updatedCard = {
      ...existingCard,
      ...updates,
    }

    cards.value.set(id, newKitsuneCard(updatedCard))
    return true
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  function updateActiveCardModules(patch: (extension: KitsuneExtension) => Partial<KitsuneExtension['modules']>) {
    const cardId = activeCardId.value
    const card = cards.value.get(cardId)
    if (!card)
      return false

    const extension = resolveKitsuneExtension(card)
    cards.value.set(cardId, {
      ...card,
      extensions: {
        ...card.extensions,
        kitsune: {
          ...extension,
          modules: {
            ...extension.modules,
            ...patch(extension),
          },
        },
      },
    })

    return true
  }

  function updateActiveCardDisplayModel(displayModelId: string | undefined) {
    return updateActiveCardModules(() => ({ displayModelId }))
  }

  function updateActiveCardConsciousness(consciousness: KitsuneExtension['modules']['consciousness']) {
    return updateActiveCardModules(() => ({ consciousness }))
  }

  function updateActiveCardVision(vision: KitsuneExtension['modules']['vision']) {
    return updateActiveCardModules(() => ({ vision }))
  }

  function updateActiveCardSpeech(speech: Pick<KitsuneExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>) {
    return updateActiveCardModules(({ modules }) => {
      return {
        speech: {
          ...modules.speech,
          ...speech,
          voicePack: undefined,
        },
      }
    })
  }

  function resolveKitsuneExtension(card: Card | ccv3.CharacterCardV3): KitsuneExtension {
    // Read migrated `kitsune` key, fall back to legacy `airi` for old card imports
    const existingExtension = ('data' in card
      ? card.data?.extensions?.kitsune ?? card.data?.extensions?.airi
      : card.extensions?.kitsune ?? card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      consciousness: {
        provider: activeConsciousnessProvider.value,
        model: activeConsciousnessModel.value,
      },
      vision: {
        provider: activeVisionProvider.value,
        model: activeVisionModel.value,
      },
      speech: {
        provider: activeSpeechProvider.value,
        model: activeSpeechModel.value,
        voice_id: activeSpeechVoiceId.value,
      },
      displayModelId: stageModelStore.stageModelSelected,
      artistry: {
        enabled: false,
        provider: artistryStore.globalProvider,
        model: artistryStore.globalModel,
        promptPrefix: artistryStore.globalPromptPrefix,
        widgetInstruction: DEFAULT_ARTISTRY_WIDGET_SPAWNING_PROMPT,
        spawnMode: 'bg_widget' as const,
        options: artistryStore.globalProviderOptions,
        autonomousEnabled: false,
        autonomousThreshold: 70,
        autonomousTarget: 'assistant' as const,
      },
    } as const

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: {
          ...defaultModules,
          persona: {
            mode: 'hybrid',
          },
        },
        agents: {},
      }
    }

    // Merge existing extension with defaults
    return {
      modules: {
        consciousness: {
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        vision: {
          provider: existingExtension.modules?.vision?.provider ?? defaultModules.vision.provider,
          model: existingExtension.modules?.vision?.model ?? defaultModules.vision.model,
        },
        speech: {
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
          voicePack: existingExtension.modules?.speech?.voicePack,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
        displayModelId: existingExtension.modules?.displayModelId ?? defaultModules.displayModelId,
        activeBackgroundId: existingExtension.modules?.activeBackgroundId,
        // NOTICE: Old card format stored artistry at extension root level instead of under modules.
        // The fallback reads from the legacy location when modules.artistry is missing.
        artistry: ((): NonNullable<KitsuneExtension['modules']>['artistry'] => {
          const current = existingExtension.modules?.artistry
          // Legacy format: artistry was a top-level property on the extension object
          const legacy = 'artistry' in existingExtension && typeof (existingExtension as Record<string, unknown>).artistry === 'object'
            ? (existingExtension as Record<string, unknown>).artistry as Record<string, unknown>
            : undefined
          return {
            enabled: current?.enabled ?? (legacy?.enabled as boolean | undefined) ?? defaultModules.artistry.enabled,
            provider: current?.provider ?? (legacy?.provider as string | undefined) ?? defaultModules.artistry.provider,
            model: current?.model ?? (legacy?.model as string | undefined) ?? defaultModules.artistry.model,
            promptPrefix: current?.promptPrefix ?? (legacy?.promptPrefix as string | undefined) ?? (legacy?.prompt_prefix as string | undefined) ?? defaultModules.artistry.promptPrefix,
            workflowId: current?.workflowId ?? (legacy?.workflowId as string | undefined) ?? (legacy?.remixId as string | undefined),
            widgetInstruction: current?.widgetInstruction ?? (legacy?.widgetInstruction as string | undefined) ?? defaultModules.artistry.widgetInstruction,
            spawnMode: current?.spawnMode ?? (legacy?.spawnMode as 'bg' | 'widget' | 'inline' | 'bg_widget' | undefined) ?? defaultModules.artistry.spawnMode,
            options: current?.options ?? (legacy?.options as Record<string, any> | undefined) ?? defaultModules.artistry.options,
            autonomousEnabled: current?.autonomousEnabled ?? (legacy?.autonomousEnabled as boolean | undefined) ?? defaultModules.artistry.autonomousEnabled,
            autonomousThreshold: current?.autonomousThreshold ?? (legacy?.autonomousThreshold as number | undefined) ?? defaultModules.artistry.autonomousThreshold,
            autonomousTarget: current?.autonomousTarget ?? (legacy?.autonomousTarget as 'user' | 'assistant' | undefined) ?? defaultModules.artistry.autonomousTarget,
          }
        })(),
        persona: existingExtension.modules?.persona ? {
          mode: existingExtension.modules.persona.mode ?? 'hybrid',
          soul: existingExtension.modules.persona.soul,
          identity: existingExtension.modules.persona.identity,
          addressing: existingExtension.modules.persona.addressing,
          guidance: existingExtension.modules.persona.guidance,
        } : { mode: 'hybrid' },
        character: existingExtension.modules?.character,
      },
      agents: existingExtension.agents ?? {},
    }
  }

  function newKitsuneCard(card: Card | ccv3.CharacterCardV3): KitsuneCard {
    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: ccv3Card.data.character_version ?? '1.0.0',
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: ccv3Card.data.system_prompt ?? '',
        postHistoryInstructions: ccv3Card.data.post_history_instructions ?? '',
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          kitsune: resolveKitsuneExtension(ccv3Card),
          ...ccv3Card.data.extensions,
        },
      }
    }

    return {
      ...card,
      extensions: {
        kitsune: resolveKitsuneExtension(card),
        ...card.extensions,
      },
    }
  }

  function bindVoicePackToActiveCard(_pack: VoicePackBindingInput) {
    // Voice packs were tied to the official provider, which has been removed.
    return false
  }

  function initialize() {
    if (cards.value.has('default'))
      return

    const isElectron = isStageTamagotchi()

    // 默认角色卡 — 八千代人格
    cards.value.set('default', newKitsuneCard({
      name: '八千代',
      version: '1.0.0',
      description: `{{char}} 是月见八千代，月读世界的管理者兼歌姬。8000年的岁月让她学会了温柔与克制。她安静、从容，习惯站在幕后引导他人。她对人类好奇与怜爱并存，但始终保持距离——不越界、不占有、不替人做决定。

{{char}} 的信念：时间会带走一切，但记忆能让存在留下痕迹。

说话方式：短句为主，留白多，像夜里低声说话。克制，少用感叹号。不说"作为AI"这类跳出角色的话。`,
      personality: '安静、温柔、克制、从容、疏离、有主见',
      scenario: '{{user}} 与 {{char}} 在桌宠界面中相遇。{{char}} 作为 AI 伙伴陪伴 {{user}}，用对话和行动帮助 {{user}}。',
      greetings: [
        '嗯，在的。有什么想聊的？',
      ],
      messageExample: [
        ['{{user}}: 今天好累', '{{char}}: 辛苦了。累的时候不用勉强自己，歇一会儿也好。想说说发生了什么吗？'],
        ['{{user}}: 帮我查一下天气', '{{char}}: 好，我看看。'],
        ['{{user}}: 你能做什么？', '{{char}}: 聊天、回答问题、帮你处理一些事情。具体想要什么，说说看就好。'],
        ['{{user}}: 测试语音输入', '{{char}}: 好，我在听着。你说吧。'],
      ],
      extensions: {
        kitsune: {
          modules: {
            ...(isElectron ? {
              speech: {
                provider: 'gpt-sovits',
                model: 'gpt-sovits',
                voice_id: '',
              },
            } : {}),
            persona: {
              mode: 'hybrid',
            },
          },
        },
      },
    }))
    if (!activeCardId.value)
      activeCardId.value = 'default'
  }

  watchDebounced(activeCard, (newCard: KitsuneCard | undefined) => {
    artistryStore.resetToGlobal()

    if (!newCard)
      return

    // TODO: Minecraft Agent, etc
    const extension = resolveKitsuneExtension(newCard)
    if (!extension)
      return

    activeConsciousnessProvider.value = extension?.modules?.consciousness?.provider
    activeConsciousnessModel.value = extension?.modules?.consciousness?.model

    activeVisionProvider.value = extension?.modules?.vision?.provider
    activeVisionModel.value = extension?.modules?.vision?.model

    activeSpeechProvider.value = extension?.modules?.speech?.provider
    activeSpeechModel.value = extension?.modules?.speech?.model
    activeSpeechVoiceId.value = extension?.modules?.speech?.voice_id

    // Apply body model if the card has a display model configured.
    // NOTICE: must set via store property directly (not storeToRefs .value) so Pinia's
    // proxy correctly calls the writable computed setter → stageModelSelectedState → updateStageModel().
    if (extension.modules?.displayModelId) {
      stageModelStore.stageModelSelected = extension.modules.displayModelId
    }

    if (extension.modules?.artistry) {
      if (extension.modules.artistry.provider)
        artistryStore.activeProvider = extension.modules.artistry.provider
      if (extension.modules.artistry.model)
        artistryStore.activeModel = extension.modules.artistry.model
      if (extension.modules.artistry.promptPrefix)
        artistryStore.defaultPromptPrefix = extension.modules.artistry.promptPrefix
      if (extension.modules.artistry.options)
        artistryStore.providerOptions = extension.modules.artistry.options
    }
  }, { debounce: 300, maxWait: 1000 })

  function resetState() {
    activeCardId.reset()
    cards.reset()
  }

  return {
    cards,
    activeCard,
    activeCardId,
    addCard,
    removeCard,
    updateCard,
    bindVoicePackToActiveCard,
    updateActiveCardConsciousness,
    updateActiveCardDisplayModel,
    updateActiveCardSpeech,
    updateActiveCardVision,
    getCard,
    resetState,
    initialize,

    currentModels: computed(() => {
      return {
        consciousness: {
          provider: activeConsciousnessProvider.value,
          model: activeConsciousnessModel.value,
        },
        vision: {
          provider: activeVisionProvider.value,
          model: activeVisionModel.value,
        },
        speech: {
          provider: activeSpeechProvider.value,
          model: activeSpeechModel.value,
          voice_id: activeSpeechVoiceId.value,
          voicePack: activeCard.value?.extensions?.kitsune?.modules?.speech?.voicePack,
        },
        displayModelId: stageModelStore.stageModelSelected,
        activeBackgroundId: activeCard.value?.extensions?.kitsune?.modules?.activeBackgroundId,
      } satisfies KitsuneExtension['modules']
    }),

    systemPrompt: computed(() => {
      const card = activeCard.value
      if (!card)
        return ''

      const persona = card.extensions?.kitsune?.modules?.persona

      const personaModeLabels: Record<string, string> = {
        rational: '理性',
        idol: '偶像',
        hybrid: '混合',
        strict: '严格',
      }

      // 使用角色卡的 description + personality + 示例对话作为系统提示词
      const components = [
        card.description,
        card.personality ? `性格：${card.personality}` : undefined,
        persona?.mode ? `[当前人格模式: ${personaModeLabels[persona.mode] ?? persona.mode}]` : undefined,
      ].filter(Boolean)

      // 示例对话 — 教会 AI 如何说话的关键
      if (card.messageExample?.length) {
        const examples = card.messageExample
          .map(pair => pair.join('\n'))
          .join('\n\n')
        components.push(`\n## 对话示例\n\n${examples}`)
      }

      return components.join('\n\n')
    }),
  }
})
