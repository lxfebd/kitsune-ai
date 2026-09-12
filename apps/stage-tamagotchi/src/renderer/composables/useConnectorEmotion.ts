import type { ConnectorInfo } from '../../shared/eventa'
import type { EmotionPayload } from '@kitsune/stage-ui/constants/emotions'
import { Emotion } from '@kitsune/stage-ui/constants/emotions'
import { useCharacterStore } from '@kitsune/stage-ui/stores/character'
import { usePetEmotionStore } from '@kitsune/stage-ui/stores/chat/emotion-pet'
import { usePetStateStore } from '@kitsune/stage-ui/stores/chat/pet-state'
import { electronConnectorChanged } from '../../shared/eventa'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { onScopeDispose } from 'vue'

export type { ConnectorInfo }

export interface ConnectorEmotionDeps {
  applyEvent: (emotion: Emotion, intensity: number) => void
  enqueue: (payload: EmotionPayload) => void
  speak: (text: string) => void
}

/** 连接器列表快照 → 桌宠反应：仅首次连上 / 全部断开时表达，避免每次 context 更新都打扰。 */
export function handleConnectorChange(connectors: ConnectorInfo[], prevCount: number, deps: ConnectorEmotionDeps): void {
  const count = connectors.length
  if (count > prevCount) {
    // 有 IDE 连上了
    const name = connectors[0]?.name || 'IDE'
    deps.applyEvent(Emotion.Curious, 1)
    deps.enqueue({ name: Emotion.Curious, intensity: 1 })
    deps.speak(`${name} 连上了！`)
  }
  else if (count < prevCount && count === 0) {
    // 全部断开
    deps.applyEvent(Emotion.Sad, 1)
    deps.enqueue({ name: Emotion.Sad, intensity: 1 })
    deps.speak('IDE 断开了，有需要随时叫我。')
  }
}

/**
 * 桥接 IDE 连接器状态到桌宠表现 — 桌宠知道你在用什么编辑器。
 *
 * 主进程 connectors 服务在连接器注册/断开时广播 electronConnectorChanged。
 * 此前只有设置页 ConnectorsPanel 消费（刷列表）；这里把"IDE 上线/全断"接到桌宠：
 *   - 数量增加 → Curious + 朗读"xxx 连上了！"
 *   - 数量归零 → Sad + 朗读"IDE 断开了"
 *
 * 在 App.vue 主布局中调用一次，与 useDirectorEmotion 并列常驻。
 */
export function useConnectorEmotion() {
  if (typeof window === 'undefined' || !window.electron?.ipcRenderer)
    return

  const petState = usePetStateStore()
  const petEmotion = usePetEmotionStore()
  const characterStore = useCharacterStore()
  let prevCount = 0

  const context = getElectronEventaContext()
  const off = context.on(electronConnectorChanged, (event) => {
    const connectors = (event?.body ?? []) as ConnectorInfo[]
    handleConnectorChange(connectors, prevCount, {
      applyEvent: petState.applyEvent,
      enqueue: petEmotion.enqueue,
      speak: text => void characterStore.emitTextOutput(text),
    })
    prevCount = connectors.length
  })

  onScopeDispose(() => off?.())
}
