import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsDeveloper = defineStore('settings-developer', () => {
  const inspectUpdaterDiagnostics = useLocalStorageManualReset<boolean>('settings/developer/inspect-updater-diagnostics', false)

  function resetState() {
    inspectUpdaterDiagnostics.reset()
  }

  return {
    inspectUpdaterDiagnostics,
    resetState,
  }
})
