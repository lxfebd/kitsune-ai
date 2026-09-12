import type { OverseerEvent } from '../../shared/eventa'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronOverseerEvent } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

/**
 * 桥接监工（overseer）事件到桌宠表现 — 确定性信号直通，不经过 LLM。
 *
 * 主进程 overseer 侧算好的结构化信号（event.data.emotion / guidance 建议与步骤 /
 * 错误信息），此前只被设置页事件流面板消费。这里把它们接到桌宠：
 *   1. 表情：reactionMapping 算出的 data.emotion 直接 enqueue（如 task_failed → Sad）
 *   2. 朗读：guidance 事件（重复失败指导）直接送 characterStore.emitTextOutput，
 *      本地化标题 + 步骤数提示由主进程已在 data 里备好，不依赖 spark:notify → LLM 中转。
 *
 * 在 App.vue 主布局中调用一次，与 useExecutorEmotion 并列常驻。
 */
export function useOverseerEmotion() {
  const petEmotion = usePetEmotionStore()
  const petState = usePetStateStore()
  const characterStore = useCharacterStore()
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const context = getElectronEventaContext()
  const off = context.on(electronOverseerEvent, (event) => {
    const payload = event?.body as OverseerEvent | undefined
    if (!payload)
      return
    handleOverseerEvent(payload)
  })

  onScopeDispose(() => off?.())

  function handleOverseerEvent(event: OverseerEvent): void {
    // 1. 结构化的情绪信号 — reactionMapping 算出来但之前没人取
    const emotion = (event.data as Record<string, unknown> | undefined)?.emotion
    if (typeof emotion === 'string' && emotion in Emotion) {
      emit(emotion as Emotion, severityIntensity(event.severity))
      return
    }

    // 2. 失败类事件 → 低落情绪（无显式 emotion 时的兜底）
    if (isFailureType(event.type)) {
      emit(Emotion.Sad, severityIntensity(event.severity))
    }

    // 3. guidance（操作指导）→ 桌宠开口给出可执行建议，走确定性朗读入口
    if (event.type === 'guidance')
      speakGuidance(event)
  }

  function emit(emotion: Emotion, intensity: number) {
    petState.applyEvent(emotion, intensity)
    petEmotion.enqueue({ name: emotion, intensity })
  }

  function speakGuidance(event: OverseerEvent): void {
    const d = event.data as Record<string, unknown> | undefined
    if (!d)
      return
    const suggestion = typeof d.suggestion === 'string' ? d.suggestion : ''
    const steps = Array.isArray(d.steps)
      ? d.steps.filter((s): s is string => typeof s === 'string')
      : []
    if (!suggestion)
      return

    const count = typeof d.count === 'number' ? d.count : undefined
    const prefix = count ? `这个错误已出现 ${count} 次，` : ''
    const stepHint = steps.length ? `修复步骤：${steps.join('；')}` : ''
    const text = `${prefix}${suggestion}。${stepHint}`.trim()

    void characterStore.emitTextOutput(text)
  }
}

function isFailureType(type: string): boolean {
  return ['task_failed', 'compile_failed', 'test_failed', 'process_crash', 'timeout'].includes(type)
}

function severityIntensity(severity: string): number {
  switch (severity) {
    case 'error':
      return 3
    case 'warn':
      return 2
    default:
      return 1
  }
}
