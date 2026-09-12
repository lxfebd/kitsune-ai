import type { MemoryEntryAddedPayload } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronMemoryEntryAdded } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export interface MemoryEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

export interface MemoryEmotionStoreDeps {
  petState: ReturnType<typeof usePetStateStore>
  petEmotion: ReturnType<typeof usePetEmotionStore>
  characterStore: ReturnType<typeof useCharacterStore>
}

/** 记忆新增 → 桌宠表现的纯逻辑（可注入依赖测试）。 */
export function handleMemoryEntryAdded(payload: MemoryEntryAddedPayload, deps: MemoryEmotionDeps): void {
  // 记忆进入状态机：思考一下 → 愉快（强度 0.6）
  deps.applyEvent(Emotion.Curious, 0.6)
  deps.enqueue({ name: Emotion.Curious, intensity: 0.6 })
  deps.applyEvent(Emotion.Happy, 0.6)
  deps.enqueue({ name: Emotion.Happy, intensity: 0.6 })

  // 用户主动写入（非对话自动抽取）时开口确认；自动抽取保持安静不打断
  if (payload.source && payload.source !== 'chat') {
    deps.speak('记住了！')
  }
}

function storeDeps(): MemoryEmotionStoreDeps {
  return {
    petState: usePetStateStore(),
    petEmotion: usePetEmotionStore(),
    characterStore: useCharacterStore(),
  }
}

/**
 * 桥接记忆新增事件到桌宠表现 — "我记住了"。
 *
 * 主进程 memory 服务在 memory_write 工具落盘 / 对话自动抽取成功时广播
 * electronMemoryEntryAdded。这里把结构化回执接到桌宠：
 *   1. 表情：Curious → 短暂思考后 Happy（0.6），进入 mood/energy 状态机
 *   2. 朗读：对用户主动写的记忆（source !== 'chat'）确定性朗读一句"我记住了"
 *
 * 在 App.vue 主布局中调用一次，与 useExecutorEmotion / useOverseerEmotion 并列常驻。
 */
export function useMemoryEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const deps = storeDeps()
  const context = getElectronEventaContext()
  const off = context.on(electronMemoryEntryAdded, (event) => {
    const payload = event?.body as MemoryEntryAddedPayload | undefined
    if (!payload)
      return
    handleMemoryEntryAdded(payload, {
      applyEvent: deps.petState.applyEvent,
      enqueue: deps.petEmotion.enqueue,
      speak: text => void deps.characterStore.emitTextOutput(text),
    })
  })

  onScopeDispose(() => off?.())
}
