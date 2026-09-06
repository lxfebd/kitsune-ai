import { resolveArtistryConfigFromStore } from '@kitsune/stage-ui/stores/modules/artistry'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'

vi.mock('~build/time', () => ({
  default: new Date('2026-01-01T00:00:00.000Z'),
}))
vi.mock('~build/git', () => ({
  abbreviatedSha: 'abcdef0',
  branch: 'main',
  committerDate: '2026-01-01T00:00:00.000Z',
}))

installStrictToolSchemaMatchers()

describe('image_journal config snapshot', () => {
  it('uses required nullable fields for strict provider schemas', async () => {
    const mockLocation = {
      origin: 'http://localhost',
      hash: '',
      search: '',
      pathname: '/',
      href: 'http://localhost/',
    }
    vi.stubGlobal('window', {
      location: mockLocation,
    })
    vi.stubGlobal('location', mockLocation)

    const { imageJournalTools } = await import('./image-journal')
    const tools = await imageJournalTools()

    expect(tools).toSatisfyStrictToolSchemas()
    // Heavy static import graph (stage-ui store modules) can exceed the default
    // 15s timeout under parallel test load; keep headroom so CI stays green.
  }, 30_000)

  it('extracts plain values instead of leaking Ref objects', () => {
    const config = resolveArtistryConfigFromStore({
      activeProvider: ref('comfyui'),
      activeModel: ref('flux'),
      defaultPromptPrefix: ref('anime style'),
      providerOptions: ref({ seed: 42 }),
      comfyuiServerUrl: ref('http://localhost:8188'),
      comfyuiSavedWorkflows: ref([{ id: 'wf-1' }]),
      comfyuiActiveWorkflow: ref('wf-1'),
      replicateApiKey: ref('r8_xxx'),
      replicateDefaultModel: ref('black-forest-labs/flux-schnell'),
      replicateAspectRatio: ref('16:9'),
      replicateInferenceSteps: ref(4),
      nanobananaApiKey: ref('AIza-test'),
      nanobananaModel: ref('gemini-3.1-flash-image-preview'),
      nanobananaResolution: ref('1K'),
    })

    expect(config).toEqual({
      provider: 'comfyui',
      model: 'flux',
      promptPrefix: 'anime style',
      options: { seed: 42 },
      globals: {
        comfyuiServerUrl: 'http://localhost:8188',
        comfyuiSavedWorkflows: [{ id: 'wf-1' }],
        comfyuiActiveWorkflow: 'wf-1',
        replicateApiKey: 'r8_xxx',
        replicateDefaultModel: 'black-forest-labs/flux-schnell',
        replicateAspectRatio: '16:9',
        replicateInferenceSteps: 4,
        nanobananaApiKey: 'AIza-test',
        nanobananaModel: 'gemini-3.1-flash-image-preview',
        nanobananaResolution: '1K',
      },
    })
  })
})
