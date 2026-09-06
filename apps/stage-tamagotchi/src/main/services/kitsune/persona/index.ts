import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { join } from 'node:path'

import { app } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  electronPersonaBuildContext,
  electronPersonaGetConfig,
  electronPersonaGetProfile,
  electronPersonaGetMode,
  electronPersonaSetMode,
  electronPersonaSetProfile,
  electronEmotionFromTool,
  electronEmotionFromText,
  electronEmotionFromCategory,
  electronCharacterList,
  electronCharacterGet,
  electronCharacterSetActive,
  electronCharacterGetActive,
} from '../../../../shared/eventa'

// Persona 系统（从 @kitsune/persona 导入）
import { PersonaContextBuilder, PersonaConfigStore, PersonaProfileStore, PersonaStateStore, PersonaGuidanceStateStore } from '@kitsune/persona'
import type { PersonaProfile, PersonaMode } from '@kitsune/persona'

// 情感映射器（从 @kitsune/emotion-mapper 导入）
import { EmotionMapper } from '@kitsune/emotion-mapper'

// 角色系统（从 @kitsune/core-character 导入）
import { createCharacterRegistry } from '@kitsune/core-character'

// 获取项目根目录（从 Electron 主进程目录向上两级）
import { getElectronMainDirname } from '../../../libs/electron/location'

import type { MemoryStore } from '../memory/store'

export interface PersonaService {
  personaBuilder: PersonaContextBuilder
}

export function createPersonaService(params: {
  context: ReturnType<typeof createContext>['context']
  memoryStore?: MemoryStore
}): PersonaService {
  const { context } = params

  // 获取正确的项目根目录
  const electronMainDirname = getElectronMainDirname()
  // electronMainDirname 指向 apps/stage-tamagotchi/src/main
  // 需要向上三级到达项目根目录: apps/stage-tamagotchi/src/main -> apps/stage-tamagotchi -> apps -> 项目根目录
  const projectRoot = join(electronMainDirname, '..', '..', '..', '..')

  // Persona 文件在 packages/kitsune-persona/ 目录中
  const personaRoot = join(projectRoot, 'packages', 'kitsune-persona')

  // 运行时数据路径（可写）— 使用 app.getPath('userData') 确保打包后可用
  const userDataPath = app.getPath('userData')
  const personaDataPath = join(userDataPath, 'kitsune-persona')

  // 将 MemoryStore 适配为 PersonaMemoryStore 接口
  // MemoryStore.listEntries 返回 MemoryEntry[]，PersonaMemoryStore.searchEntries 期望 { items: [{ content }] }
  const personaMemoryStore = params.memoryStore
    ? {
        searchEntries: async (opts: { query: string, limit: number, minScore: number, maxChars: number }) => {
          const entries = await params.memoryStore!.listEntries({
            q: opts.query,
            limit: opts.limit,
            type: 'preference',
          })
          return {
            items: entries.map(e => ({ content: e.content })),
          }
        },
        addEntry: async (entry: { content: string, keywords: string[], source_session_id?: string, source_trace_id?: string, metadata?: Record<string, unknown> }) => {
          const result = await params.memoryStore!.addEntry({
            content: entry.content,
            type: 'preference',
            source: 'persona_writeback',
            sessionId: entry.source_session_id,
          })
          return { id: result.id }
        },
      }
    : null

  // 初始化 store 实例（统一创建，同时注入 PersonaContextBuilder 和 IPC handler）
  const personaConfigStore = new PersonaConfigStore({ configPath: join(projectRoot, 'apps', 'stage-tamagotchi', 'config', 'persona.yaml') })
  const personaProfileStore = new PersonaProfileStore({ profilePath: join(personaDataPath, 'profile.yaml') })
  const personaStateStore = new PersonaStateStore({ filePath: join(personaDataPath, 'persona-state.json') })
  const personaGuidanceStateStore = new PersonaGuidanceStateStore({ statePath: join(personaDataPath, 'guidance-state.json') })

  // 初始化人格系统 — 注入统一 store 实例，避免双重实例导致读写脱节
  const personaBuilder = new PersonaContextBuilder({
    workspaceDir: personaRoot,
    memoryStore: personaMemoryStore,
    configStore: personaConfigStore,
    profileStore: personaProfileStore,
    stateStore: personaStateStore,
    guidanceStore: personaGuidanceStateStore,
  })

  // 初始化情感映射器
  const emotionMapper = new EmotionMapper()

  // 初始化角色系统
  const characterRegistry = createCharacterRegistry()

  // --- Persona IPC handlers ---

  defineInvokeHandler(context, electronPersonaBuildContext, async (payload) => {
    const result = await personaBuilder.build({
      sessionId: payload?.sessionId,
      input: payload?.input,
    })
    console.log(`[persona] buildContext mode=${result.mode} source=${result.source} prompt=${result.prompt.length} chars`)
    return {
      prompt: result.prompt,
      mode: result.mode,
      source: result.source,
      addressing: result.addressing,
      guidance: result.guidance,
      sources: result.sources,
    }
  })

  defineInvokeHandler(context, electronPersonaGetConfig, async () => {
    const config = await personaConfigStore.load()
    return config as unknown as Record<string, unknown>
  })

  defineInvokeHandler(context, electronPersonaGetProfile, async () => {
    const profile = await personaProfileStore.load()
    return profile as unknown as Record<string, unknown>
  })

  defineInvokeHandler(context, electronPersonaSetProfile, async (payload) => {
    // IPC 契约为 Record<string, unknown>，store 内部 normalizeProfile 会做运行时归一化
    const updated = await personaProfileStore.save(payload as Partial<PersonaProfile>)
    return updated as unknown as Record<string, unknown>
  })

  defineInvokeHandler(context, electronPersonaGetMode, async () => {
    const state = personaStateStore.get('__persona_shared__')
    return {
      mode: state?.mode ?? 'hybrid',
      source: state?.mode_source ?? 'default',
    }
  })

  defineInvokeHandler(context, electronPersonaSetMode, async (payload) => {
    personaStateStore.set('__persona_shared__', {
      mode: payload.mode as PersonaMode,
      mode_source: 'input',
    })
  })

  // --- Emotion Mapper IPC handlers ---

  defineInvokeHandler(context, electronEmotionFromTool, async (payload) => {
    return emotionMapper.getEmotionFromTool(payload.toolName)
  })

  defineInvokeHandler(context, electronEmotionFromText, async (payload) => {
    return emotionMapper.getEmotionFromText(payload.text)
  })

  defineInvokeHandler(context, electronEmotionFromCategory, async (payload) => {
    return emotionMapper.getEmotionFromResponseCategory(payload.category)
  })

  // --- Character System IPC handlers ---

  defineInvokeHandler(context, electronCharacterList, async () => {
    // list() 返回 readonly Character[]，展开为可变数组以匹配 IPC 响应类型 ElectronCharacter[]
    // Character 是 ElectronCharacter 的超集，结构兼容
    return [...characterRegistry.list()]
  })

  defineInvokeHandler(context, electronCharacterGet, async (payload) => {
    return characterRegistry.get(payload.id) ?? null
  })

  defineInvokeHandler(context, electronCharacterSetActive, async (payload) => {
    return characterRegistry.setActive(payload.id)
  })

  defineInvokeHandler(context, electronCharacterGetActive, async () => {
    return characterRegistry.getActive() ?? null
  })

  return { personaBuilder }
}
