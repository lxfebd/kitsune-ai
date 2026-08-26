import { describe, expect, it, vi } from 'vitest'

import { useCaptionItems } from './useCaptionItems'

describe('useCaptionItems', () => {
  it('expires each caption event without cancelling earlier events of the same type', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ type: 'caption-speaker', text: 'first' })
      vi.advanceTimersByTime(500)
      captions.add({ type: 'caption-speaker', text: 'second' })

      expect(captions.items.value.map(item => item.text)).toEqual(['first', 'second'])

      vi.advanceTimersByTime(500)

      expect(captions.items.value.map(item => item.text)).toEqual(['second'])

      vi.advanceTimersByTime(500)

      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('clears caption items of the matching type when an empty event arrives', () => {
    vi.useFakeTimers()

    try {
      const captions = useCaptionItems({ ttlMs: 1000 })

      captions.add({ type: 'caption-speaker', text: 'speaker' })
      captions.add({ type: 'caption-assistant', text: 'assistant' })
      captions.add({ type: 'caption-speaker', text: '' })

      expect(captions.items.value.map(item => item.text)).toEqual(['assistant'])

      // assistant 项不过期（AI 回复气泡持久显示，不设 TTL），推进 ttl 后仍存在
      vi.advanceTimersByTime(1000)

      expect(captions.items.value.map(item => item.text)).toEqual(['assistant'])

      // 需显式 clearType 才能移除不过期的 assistant 项
      captions.clearType('caption-assistant')

      expect(captions.items.value).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })
})
