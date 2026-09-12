import type { SidecarStatus } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronSidecarStatusChanged } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export interface SidecarEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

/** sidecar 状态 → 桌宠表情/朗读的纯逻辑（可注入依赖测试）。 */
export function handleSidecarStatus(status: SidecarStatus, deps: SidecarEmotionDeps): void {
  switch (status.state) {
    case 'degraded': {
      // 重启预算耗尽（5 分钟内超 3 次）→ 担忧 + 告知用户引擎降级
      deps.applyEvent(Emotion.Sad, 2)
      deps.enqueue({ name: Emotion.Sad, intensity: 2 })
      deps.speak(`${status.id} 启动失败太多次，我已切换到备用方案。`)
      break
    }
    case 'error': {
      deps.applyEvent(Emotion.Awkward, 2)
      deps.enqueue({ name: Emotion.Awkward, intensity: 2 })
      deps.speak(`${status.id} 出错了，可能是没找到引擎。`)
      break
    }
    case 'running': {
      // 恢复健康 → 松一口气（愉快）
      deps.applyEvent(Emotion.Happy, 1)
      deps.enqueue({ name: Emotion.Happy, intensity: 1 })
      break
    }
    default:
      break
  }
}

/**
 * 桥接 sidecar 状态到桌宠表现 — 语音引擎/图像引擎「活着」的信号。
 *
 * 主进程 SidecarService.setStatus 广播 electronSidecarStatusChanged（GPT-SoVITS 崩了、
 * ComfyUI 挂了、重启预算耗尽降级）。此前只有 TTS 设置页消费；这里把它们接到桌宠：
 *   - degraded → Sad + 朗读"切换到备用方案"
 *   - error   → Awkward + 朗读"出错了"
 *   - running → Happy（恢复健康松口气）
 *
 * 在 App.vue 主布局中调用一次，与 useMemoryEmotion 并列常驻。
 */
export function useSidecarEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const petState = usePetStateStore()
  const petEmotion = usePetEmotionStore()
  const characterStore = useCharacterStore()

  const context = getElectronEventaContext()
  const off = context.on(electronSidecarStatusChanged, (event) => {
    const status = event?.body as SidecarStatus | undefined
    if (!status)
      return
    handleSidecarStatus(status, {
      applyEvent: petState.applyEvent,
      enqueue: petEmotion.enqueue,
      speak: text => void characterStore.emitTextOutput(text),
    })
  })

  onScopeDispose(() => off?.())
}