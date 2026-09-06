import type { VoicePackBindingInput } from './modules/persona'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { SERVER_URL } from '../libs/server'

export type VoicePackListItem = VoicePackBindingInput & {
  description: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Loads the enabled Voice Pack library from the AIRI server.
 *
 * Use when:
 * - Settings pages need the curated Voice Pack list before binding one to the
 *   active character card.
 *
 * Expects:
 * - Voice packs were tied to the official provider, which has been removed.
 *
 * Returns:
 * - Reactive list/error/loading state plus a `load()` action.
 */
export const useVoicePacksStore = defineStore('voice-packs', () => {
  const packs = ref<VoicePackListItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null

    try {
      const res = await fetch(new URL('/api/v1/voice-packs', SERVER_URL))
      if (!res.ok)
        throw new Error(`voice packs upstream ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 256))

      const data = await res.json() as VoicePackListItem[]
      packs.value = data
      return data
    }
    catch (err) {
      error.value = errorMessageFrom(err) ?? 'Unknown error'
      packs.value = []
      return []
    }
    finally {
      loading.value = false
    }
  }

  return { packs, loading, error, load }
})
