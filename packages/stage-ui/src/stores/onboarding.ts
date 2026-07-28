import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useProvidersStore } from './providers'

const essentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'openai-compatible'] as const
const credentialBasedEssentialProviderIds = ['openai', 'azure-openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'deepseek'] as const

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const providersStore = useProvidersStore()

  // Track if first-time setup has been completed or skipped
  const hasCompletedSetup = useLocalStorage('onboarding/completed', false)
  const hasSkippedSetup = useLocalStorage('onboarding/skipped', false)

  // Track if we should show the setup dialog
  const showingSetup = ref(false)

  // Check if any essential provider is configured
  const hasEssentialProviderConfigured = computed(() => {
    return essentialProviderIds.some(providerId => providersStore.configuredProviders[providerId])
  })

  // Fallback for app startup timing:
  // If configured state has not been revalidated yet, infer "configured"
  // from persisted essential credentials.
  const hasEssentialProviderCredentialConfigured = computed(() => {
    return credentialBasedEssentialProviderIds.some((providerId) => {
      const providerConfig = providersStore.providers[providerId] as Record<string, unknown> | undefined
      if (!providerConfig) {
        return false
      }

      return hasNonEmptyText(providerConfig.apiKey)
    })
  })

  // Check if first-time setup should be shown
  const needsOnboarding = computed(() =>
    !hasSkippedSetup.value
    && !hasCompletedSetup.value,
  )

  // Keep in-memory display flag aligned with persisted onboarding status
  // when setup is completed/skipped from another window (desktop multi-window case).
  watch(needsOnboarding, (needSetup) => {
    if (!needSetup) {
      showingSetup.value = false
    }
  })

  // Mark setup as completed
  //
  // NOTICE: we write localStorage directly in addition to setting the
  // useLocalStorage ref values. The ref write is async (VueUse watch
  // flush: 'post'), but the onboarding window closes immediately after
  // this call — the watch callback never fires, so the write is lost.
  // The explicit setItem ensures persistence even if the window is
  // destroyed before the next tick.
  function markSetupCompleted() {
    hasCompletedSetup.value = true
    hasSkippedSetup.value = false
    showingSetup.value = false
    localStorage.setItem('onboarding/completed', 'true')
    localStorage.setItem('onboarding/skipped', 'false')
  }

  // Mark setup as skipped
  //
  // NOTICE: same rationale as markSetupCompleted — direct localStorage
  // write to survive immediate window close.
  function markSetupSkipped() {
    hasSkippedSetup.value = true
    showingSetup.value = false
    localStorage.setItem('onboarding/skipped', 'true')
  }

  // Reset setup state (for testing or re-showing setup)
  function resetSetupState() {
    hasCompletedSetup.value = false
    hasSkippedSetup.value = false
    showingSetup.value = false
  }

  // Force show setup dialog
  function forceShowSetup() {
    showingSetup.value = true
  }

  return {
    hasCompletedSetup,
    hasSkippedSetup,
    showingSetup,
    hasEssentialProviderConfigured,
    hasEssentialProviderCredentialConfigured,
    needsOnboarding,

    markSetupCompleted,
    markSetupSkipped,
    resetSetupState,
    forceShowSetup,
  }
})
