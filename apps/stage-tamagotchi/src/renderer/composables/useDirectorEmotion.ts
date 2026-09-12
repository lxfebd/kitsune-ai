import type { DirectorVerdictEventPayload } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronDirectorEvent } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export interface DirectorEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

/** director 裁决 → 桌宠表情/朗读的纯逻辑（可注入依赖测试）。 */
export function handleDirectorVerdict(payload: DirectorVerdictEventPayload, deps: DirectorEmotionDeps): void {
  if (payload.verdict === 'approved') {
    deps.applyEvent(Emotion.Happy, 1)
    deps.enqueue({ name: Emotion.Happy, intensity: 1 })
    deps.speak('这份计划我批了，开工吧！')
  }
  else {
    deps.applyEvent(Emotion.Think, 1)
    deps.enqueue({ name: Emotion.Think, intensity: 1 })
    deps.speak('这份计划还差点意思，我打回去了。')
  }
}

/**
 * 桥接 director 裁决到桌宠表现 — 桌宠以"总监身份"说话。
 *
 * 主进程 directorApprove/directorReject 落盘后广播 electronDirectorEvent。
 * 此前这两个动作只写文件，桌宠对自己的裁决毫无表达；这里补上：
 *   - approved → Happy + 朗读"我批了"
 *   - rejected → Think + 朗读"打回去了"
 *
 * 在 App.vue 主布局中调用一次，与 useSidecarEmotion 并列常驻。
 */
export function useDirectorEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const petState = usePetStateStore()
  const petEmotion = usePetEmotionStore()
  const characterStore = useCharacterStore()

  const context = getElectronEventaContext()
  const off = context.on(electronDirectorEvent, (event) => {
    const payload = event?.body as DirectorVerdictEventPayload | undefined
    if (!payload)
      return
    handleDirectorVerdict(payload, {
      applyEvent: petState.applyEvent,
      enqueue: petEmotion.enqueue,
      speak: text => void characterStore.emitTextOutput(text),
    })
  })

  onScopeDispose(() => off?.())
}
