import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsVrm = defineStore('settings-vrm', () => {
  // Maximum render frames-per-second for the VRM (Three.js) renderer.
  // Defaults to 30 to avoid the renderer running at full refresh-rate while idle
  // (the previous behavior ran `TresCanvas` in `always` mode at unlimited FPS,
  // continuously burning a full CPU core). 0 means unlimited.
  const vrmMaxFps = useLocalStorageManualReset<number>('settings/vrm/max-fps', 30)

  function resetState() {
    vrmMaxFps.reset()
  }

  return {
    vrmMaxFps,
    resetState,
  }
})
