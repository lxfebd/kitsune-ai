// Domain: persona — eventa IPC 契约按域拆分
import type { Locale } from '@intlify/core'
import { defineInvokeEventa } from '@moeru/eventa'

export interface PersonaBuildContextPayload {
  sessionId?: string
  input?: string
}

export interface PersonaBuildContextResult {
  prompt: string
  mode: string
  source: string
  addressing?: string
  guidance?: { promptedForCustomName: boolean }
  sources: string[]
}

export const electronPersonaBuildContext = defineInvokeEventa<PersonaBuildContextResult, PersonaBuildContextPayload>('eventa:invoke:electron:persona:build-context')
export const electronPersonaGetConfig = defineInvokeEventa<Record<string, unknown>>('eventa:invoke:electron:persona:get-config')
export const electronPersonaGetProfile = defineInvokeEventa<Record<string, unknown>>('eventa:invoke:electron:persona:get-profile')
export const electronPersonaSetProfile = defineInvokeEventa<Record<string, unknown>, Record<string, unknown>>('eventa:invoke:electron:persona:set-profile')
export const electronPersonaGetMode = defineInvokeEventa<{ mode: string, source: string }>('eventa:invoke:electron:persona:get-mode')
export const electronPersonaSetMode = defineInvokeEventa<void, { mode: string }>('eventa:invoke:electron:persona:set-mode')

// Emotion mapper events
export const electronEmotionFromTool = defineInvokeEventa<string, { toolName: string }>('eventa:invoke:electron:emotion:from-tool')
export const electronEmotionFromText = defineInvokeEventa<string, { text: string }>('eventa:invoke:electron:emotion:from-text')
export const electronEmotionFromCategory = defineInvokeEventa<string, { category: string }>('eventa:invoke:electron:emotion:from-category')

// Character system events
export interface ElectronCharacter {
  id: string
  name: string
  personaId?: string
  soul?: string
  identity?: string
  voice?: { adapter: string, voiceId: string }
  model?: { engine: string, source: string }
  expressions?: Array<{ emotion: string }>
  metadata?: { description?: string, tags?: string[], avatar?: string }
  enabled?: boolean
}

export const electronCharacterList = defineInvokeEventa<ElectronCharacter[]>('eventa:invoke:electron:character:list')
export const electronCharacterGet = defineInvokeEventa<ElectronCharacter | null, { id: string }>('eventa:invoke:electron:character:get')
export const electronCharacterSetActive = defineInvokeEventa<boolean, { id: string }>('eventa:invoke:electron:character:set-active')
export const electronCharacterGetActive = defineInvokeEventa<ElectronCharacter | null>('eventa:invoke:electron:character:get-active')

// Onboarding window events
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')

export const i18nSetLocale = defineInvokeEventa<void, Locale>('eventa:invoke:electron:i18n:set-locale')
export const i18nGetLocale = defineInvokeEventa<string | undefined>('eventa:invoke:electron:i18n:get-locale')

// Overseer 监工系统 — schema 与 IPC 契约
// 事件 schema 权威定义在此（shared 契约所有方），main 侧 eventSchema.ts 重新导出。
