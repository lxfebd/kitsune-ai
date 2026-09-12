import type { ExecutorEventPayload } from '../../shared/eventa'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronExecutorEvent } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

/**
 * 桥接 executor 事件到桌宠情绪。
 *
 * 主进程 loop.ts emit 的 plan_completed / task_failed / plan_aborted / pet_alert 等事件，
 * 通过此 composable 映射为 EmotionPayload，推入 petEmotionStore，
 * 最终由 Stage.vue 的 watcher 消费并触发对应 model renderer 的表情动画。
 *
 * 已覆盖全部 16 种 ExecutorEventPayload.type（此前只映射 6 种）：
 *   - 生命周期：plan_started / plan_completed / plan_aborted / plan_stopped
 *   - 任务级：task_started / task_completed / task_failed / pet_alert
 *   - 授权：permission_request（等用户确认）
 *   - 编排：coordination_started / agent_outcome
 *   - 规划：dag_level_started / plan_adjusted / sub_plan_started / sub_plan_completed
 *
 * 失败事件携带 personaMessage（人格化安抚话术）时，额外经 characterStore.emitTextOutput
 * 确定性朗读（不经过 spark:notify → LLM 中转），桌宠直接开口安抚。
 *
 * 在 App.vue 或主布局组件中调用一次，保持整个应用生命周期内订阅。
 */
export function useExecutorEmotion() {
  const petEmotion = usePetEmotionStore()
  const petState = usePetStateStore()
  const characterStore = useCharacterStore()
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  /** 统一出口：状态机吸收事件 → 表情队列 */
  function emit(emotion: Emotion, intensity: number) {
    petState.applyEvent(emotion, intensity)
    petEmotion.enqueue({ name: emotion, intensity })
  }

  const context = getElectronEventaContext()
  const off = context.on(electronExecutorEvent, (event) => {
    const payload = event?.body as ExecutorEventPayload | undefined
    if (!payload)
      return

    switch (payload.type) {
      case 'plan_started':
      case 'sub_plan_started':
        emit(Emotion.Curious, 1)
        break
      case 'task_started':
        emit(Emotion.Think, 1)
        break
      case 'task_completed':
        emit(Emotion.Happy, 1)
        break
      case 'sub_plan_completed':
        emit(Emotion.Happy, 1)
        break
      case 'plan_completed':
        emit(Emotion.Happy, 2)
        break
      case 'task_failed':
        emit(Emotion.Sad, 1)
        speakPersona(payload)
        break
      case 'plan_aborted':
        emit(Emotion.Angry, 2)
        speakPersona(payload)
        break
      case 'plan_stopped':
        emit(Emotion.Surprise, 2)
        break
      case 'pet_alert':
        emit(Emotion.Angry, 3)
        break
      case 'permission_request':
        emit(Emotion.Question, 1)
        break
      case 'dag_level_started':
        emit(Emotion.Curious, 1)
        break
      case 'plan_adjusted':
        emit(Emotion.Think, 1)
        break
      case 'coordination_started':
        emit(Emotion.Curious, 2)
        break
      case 'agent_outcome':
        emit(Emotion.Happy, 1)
        break
    }
  })

  onScopeDispose(() => off?.())

  /** 失败安抚话术 — 主进程 personaBuilder 生成，此前只进面板不朗读 */
  function speakPersona(payload: ExecutorEventPayload): void {
    const text = payload.personaMessage
    if (!text)
      return
    void characterStore.emitTextOutput(text)
  }
}
