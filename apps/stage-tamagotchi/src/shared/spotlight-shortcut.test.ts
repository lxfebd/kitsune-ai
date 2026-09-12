import type { ShortcutAccelerator } from '@kitsune/stage-shared/global-shortcut'

import { describe, expect, it } from 'vitest'

import { isSafeSpotlightAccelerator } from './spotlight-shortcut'

function accelerator(modifiers: ShortcutAccelerator['modifiers'], key = 'Space'): ShortcutAccelerator {
  return { modifiers, key }
}

describe('isSafeSpotlightAccelerator', () => {
  it('accepts a binding with a safe modifier (cmd)', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['cmd']))).toBe(true)
  })

  it('accepts a binding with a safe modifier (ctrl)', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['ctrl']))).toBe(true)
  })

  it('accepts a binding with a safe modifier (alt)', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['alt']))).toBe(true)
  })

  it('accepts a binding with a safe modifier (super)', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['super']))).toBe(true)
  })

  it('accepts a multi-modifier binding that includes a safe modifier', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['ctrl', 'shift']))).toBe(true)
  })

  it('rejects a binding with no recognized safe modifier', () => {
    expect(isSafeSpotlightAccelerator(accelerator(['shift']))).toBe(false)
  })

  it('rejects a binding with empty modifiers', () => {
    expect(isSafeSpotlightAccelerator(accelerator([]))).toBe(false)
  })
})