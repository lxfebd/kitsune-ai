import type { ExecutorEventPayload } from '../../shared/eventa'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { electronExecutorEvent } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

/**
 * 桥接 executor 事件到桌宠情绪。
 *
 * 主进程 loop.ts emit 的 plan_completed / task_failed / plan_aborted / pet_alert 事件，
 * 通过此 composable 映射为 EmotionPayload，推入 petEmotionStore，
 * 最终由 Stage.vue 的 watcher 消费并触发对应 model renderer 的表情动画。
 *
 * 在 App.vue 或主布局组件中调用一次，保持整个应用生命周期内订阅。
 */
export function useExecutorEmotion() {
  const petEmotion = usePetEmotionStore()
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const context = getElectronEventaContext()
  const off = context.on(electronExecutorEvent, (event) => {
    const payload = event?.body as ExecutorEventPayload | undefined
    if (!payload)
      return

    switch (payload.type) {
      case 'plan_completed':
        petEmotion.enqueue({ name: Emotion.Happy, intensity: 2 })
        break
      case 'task_failed':
        petEmotion.enqueue({ name: Emotion.Sad, intensity: 1 })
        break
      case 'plan_aborted':
        petEmotion.enqueue({ name: Emotion.Angry, intensity: 2 })
        break
      case 'pet_alert':
        petEmotion.enqueue({ name: Emotion.Angry, intensity: 3 })
        break
      case 'plan_stopped':
        petEmotion.enqueue({ name: Emotion.Surprise, intensity: 2 })
        break
      case 'sub_plan_started':
        petEmotion.enqueue({ name: Emotion.Curious, intensity: 1 })
        break
    }
  })

  onScopeDispose(() => off?.())
}