import type { PluginLifecycleEventPayload } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronPluginLifecycleEvent } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export type { PluginLifecycleEventPayload }

export interface PluginLifecycleEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

/** 插件生命周期事件 → 桌宠表情/朗读的纯逻辑（可注入依赖测试）。 */
export function handlePluginLifecycle(event: PluginLifecycleEventPayload, deps: PluginLifecycleEmotionDeps): void {
  switch (event.kind) {
    case 'load-failed': {
      // 插件启动失败 — 担忧 + 朗读（可操作：用户去设置页看原因）
      deps.applyEvent(Emotion.Sad, 1)
      deps.enqueue({ name: Emotion.Sad, intensity: 1 })
      deps.speak(`有个插件 ${event.extensionId} 没启动成功，去设置页看看原因吧。`)
      break
    }
    case 'degraded': {
      // 能力降级 — 担忧但不朗读（避免高频打扰，capability 可能反复降级）
      deps.applyEvent(Emotion.Awkward, 0.6)
      deps.enqueue({ name: Emotion.Awkward, intensity: 0.6 })
      break
    }
    case 'unloaded':
    default:
      // 卸载 — 平静，桌宠不打扰
      break
  }
}

/**
 * 桥接插件生命周期事件到桌宠表现 — 插件坏了桌宠知道。
 *
 * 主进程插件服务在插件启动失败 / 能力降级 / 卸载时广播 electronPluginLifecycleEvent。
 * 此前插件状态只被设置页插件面板消费（列表快照）；这里把它们接到桌宠：
 *   - load-failed → Sad + 朗读"去设置页看看"
 *   - degraded   → Awkward（能力降级，静默避免高频打扰）
 *
 * 在 App.vue 主布局中调用一次，与 useDesktopActionEmotion 并列常驻。
 */
export function usePluginLifecycleEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const petState = usePetStateStore()
  const petEmotion = usePetEmotionStore()
  const characterStore = useCharacterStore()

  const context = getElectronEventaContext()
  const off = context.on(electronPluginLifecycleEvent, (event) => {
    const payload = event?.body as PluginLifecycleEventPayload | undefined
    if (!payload)
      return
    handlePluginLifecycle(payload, {
      applyEvent: petState.applyEvent,
      enqueue: petEmotion.enqueue,
      speak: text => void characterStore.emitTextOutput(text),
    })
  })

  onScopeDispose(() => off?.())
}
