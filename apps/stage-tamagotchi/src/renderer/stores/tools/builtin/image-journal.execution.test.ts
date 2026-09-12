import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAddBackground = vi.fn()
const mockAddWidget = vi.fn()
const mockUpdateCard = vi.fn()

// 执行路径只依赖 store 的这几个字段；persona store 的空 activeCard 让
// cardArtistry 走全局配置，背景/卡片写回用 mock 收尾。
vi.mock('@kitsune/stage-ui/stores/background', () => ({
  useBackgroundStore: () => ({
    addBackground: mockAddBackground,
  }),
}))

vi.mock('@kitsune/stage-ui/stores/modules/persona', () => ({
  usePersonaStore: () => ({
    activeCard: undefined,
    activeCardId: 'card-1',
    cards: new Map(),
    updateCard: mockUpdateCard,
  }),
}))

vi.mock('@kitsune/stage-ui/stores/modules/artistry', () => ({
  resolveArtistryConfigFromStore: () => ({
    provider: 'comfyui',
    model: 'flux',
    promptPrefix: '',
    options: {},
    globals: {},
  }),
  useArtistryStore: () => ({}),
}))

describe('image_journal create execution path', () => {
  beforeEach(() => {
    mockAddBackground.mockReset()
    mockAddWidget.mockReset()
    mockUpdateCard.mockReset()
  })

  it('converts a data-URL base64 payload into a Blob without fetching', async () => {
    // 装上 spy 以断言「data URL 走直转 Blob，不再 fetch 一轮」
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { executeImageJournalAction } = await import('./image-journal')
    const generateHeadless = vi.fn().mockResolvedValue({
      base64: 'data:image/png;base64,aGVsbG8=',
    })
    mockAddBackground.mockResolvedValue('entry-1')

    const result = await executeImageJournalAction(
      { action: 'create', prompt: 'a cat' },
      { invokers: { generateHeadless, addWidget: mockAddWidget } },
    )

    const parsed = JSON.parse(result)
    expect(parsed.entryId).toBe('entry-1')
    expect(parsed.mode).toBe('inline')
    expect(mockAddBackground).toHaveBeenCalledTimes(1)
    const [, blob] = mockAddBackground.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(Buffer.from(new Uint8Array(await blob.arrayBuffer())).toString()).toBe('hello')
    expect(mockAddWidget).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('passes an abort signal bound to the 60s timeout to generateHeadless', async () => {
    const { executeImageJournalAction } = await import('./image-journal')
    const generateHeadless = vi.fn().mockResolvedValue({
      base64: 'data:image/png;base64,aGVsbG8=',
    })
    mockAddBackground.mockResolvedValue('entry-1')

    await executeImageJournalAction(
      { action: 'create', prompt: 'a cat' },
      { invokers: { generateHeadless, addWidget: mockAddWidget } },
    )

    expect(generateHeadless).toHaveBeenCalledTimes(1)
    const [, options] = generateHeadless.mock.calls[0]
    expect(options.signal).toBeDefined()
    expect(options.signal.aborted).toBe(false)
  })

  it('turns a hanging generateHeadless into a friendly timeout error instead of hanging the turn', async () => {
    const { executeImageJournalAction } = await import('./image-journal')
    const timeoutError = new Error('The operation was aborted due to timeout')
    timeoutError.name = 'TimeoutError'
    const generateHeadless = vi.fn().mockRejectedValue(timeoutError)

    const result = await executeImageJournalAction(
      { action: 'create', prompt: 'a cat' },
      { invokers: { generateHeadless, addWidget: mockAddWidget } },
    )

    expect(result).toContain('图片生成超时（60000ms）')
    expect(mockAddBackground).not.toHaveBeenCalled()
  })

  it('rejects bare base64 payloads instead of fetching an invalid data URL', async () => {
    const { executeImageJournalAction } = await import('./image-journal')
    const generateHeadless = vi.fn().mockResolvedValue({
      base64: 'aGVsbG8=',
    })

    const result = await executeImageJournalAction(
      { action: 'create', prompt: 'a cat' },
      { invokers: { generateHeadless, addWidget: mockAddWidget } },
    )

    expect(result).toContain('invalid base64 payload')
    expect(mockAddBackground).not.toHaveBeenCalled()
  })

  it('downloads an imageUrl fallback with an abort signal and status check', async () => {
    const { executeImageJournalAction } = await import('./image-journal')
    const generateHeadless = vi.fn().mockResolvedValue({
      imageUrl: 'http://artistry.local/img.png',
    })
    mockAddBackground.mockResolvedValue('entry-1')

    let capturedSignal: AbortSignal | undefined
    const fetchStub = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      capturedSignal = options.signal as AbortSignal | undefined
      return {
        ok: true,
        blob: async () => new Blob(['img'], { type: 'image/png' }),
      }
    })
    vi.stubGlobal('fetch', fetchStub)

    try {
      const result = await executeImageJournalAction(
        { action: 'create', prompt: 'a cat' },
        { invokers: { generateHeadless, addWidget: mockAddWidget } },
      )

      expect(JSON.parse(result).entryId).toBe('entry-1')
      expect(capturedSignal).toBeDefined()
      expect(capturedSignal?.aborted).toBe(false)
      expect(mockAddBackground).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
