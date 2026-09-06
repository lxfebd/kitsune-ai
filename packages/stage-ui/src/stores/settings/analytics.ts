import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsAnalytics = defineStore('settings-analytics', () => {
  const analyticsEnabled = useLocalStorageManualReset<boolean>('settings/analytics/enabled', true)

  function resetState() {
    analyticsEnabled.reset()
  }

  return {
    analyticsEnabled,
    resetState,
  }
})
