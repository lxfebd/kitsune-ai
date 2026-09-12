import type { DesktopAutomationActionEventPayload } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronDesktopAutomationAction } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export type { DesktopAutomationActionEventPayload }

export interface DesktopActionEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

/** 桌面自动化动作 → 桌宠表情/朗读的纯逻辑（可注入依赖测试）。 */
export function handleDesktopAction(event: DesktopAutomationActionEventPayload, deps: DesktopActionEmotionDeps): void {
  switch (event.phase) {
    case 'start': {
      // 动作开始 — 桌宠"我在帮你操作"，认真脸
      deps.applyEvent(Emotion.Think, 0.8)
      deps.enqueue({ name: Emotion.Think, intensity: 0.8 })
      break
    }
    case 'done': {
      // 完成 — 松口气，不朗读（高频动作避免打扰）
      deps.applyEvent(Emotion.Happy, 0.4)
      deps.enqueue({ name: Emotion.Happy, intensity: 0.4 })
      break
    }
    case 'error': {
      // 失败 — 懊恼 + 朗读一次
      deps.applyEvent(Emotion.Awkward, 1)
      deps.enqueue({ name: Emotion.Awkward, intensity: 1 })
      deps.speak('这个操作没成功，我看看哪里不对。')
      break
    }
    default:
      break
  }
}

/**
 * 桥接桌面自动化动作到桌宠表现 — 鼠标键盘被代操作时桌宠"在场"。
 *
 * 主进程 runDesktopAction 在动作开始/完成/失败时广播 electronDesktopAutomationAction。
 * 此前桌面自动化只被工具链消费（web-tools / executor）；这里把它们接到桌宠：
 *   - start  → Think（"我在帮你点"）
 *   - done   → Happy（松口气，静默避免高频打扰）
 *   - error  → Awkward + 朗读"没成功"
 *
 * 在 App.vue 主布局中调用一次，与 useConnectorEmotion 并列常驻。
 */
export function useDesktopActionEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const petState = usePetStateStore()
  const petEmotion = usePetEmotionStore()
  const characterStore = useCharacterStore()

  const context = getElectronEventaContext()
  const off = context.on(electronDesktopAutomationAction, (event) => {
    const payload = event?.body as DesktopAutomationActionEventPayload | undefined
    if (!payload)
      return
    handleDesktopAction(payload, {
      applyEvent: petState.applyEvent,
      enqueue: petEmotion.enqueue,
      speak: text => void characterStore.emitTextOutput(text),
    })
  })

  onScopeDispose(() => off?.())
}
