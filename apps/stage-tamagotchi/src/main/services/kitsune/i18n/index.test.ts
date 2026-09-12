import type { BrowserWindow } from 'electron'

import { createContext } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18nGetLocale, i18nSetLocale } from '../../../../shared/eventa'
import { createI18nService } from './index'

// defineInvokeHandler 在运行时触碰 electron IPC，这里替换为记录型 stub；
// 其余 @moeru/eventa 导出保持真实（shared/eventa 的契约对象依赖它们）。
const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

// createI18nService 通过 injeca 解析 config 存储（覆盖 configs:app provider）。
const injecaResolveMock = vi.hoisted(() => vi.fn())

vi.mock('injeca', () => ({
  injeca: { resolve: injecaResolveMock },
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => {
    const log = vi.fn()
    return {
      useGlobalConfig: () => ({ log, withFields: () => ({ log }) }),
    }
  }),
}))

// 与 connectors 测试同款：core context 与 adapter context 类型不兼容，
// 用服务参数类型取 context 形状并 cast。
type ServiceContext = Parameters<typeof createI18nService>[0]['context']

interface I18nLikeWithLocale {
  t: (key: string, ...args: unknown[]) => string
  locale: (value: string) => void
}

// I18n 泛型接口有较多成员；测试只关心 locale 调用，用 never cast 绕过成员校验
function makeI18n(locale: (value: string) => void): I18nLikeWithLocale {
  return { t: () => '', locale }
}

describe('createI18nService', () => {
  let context: ServiceContext
  let window: BrowserWindow
  let localeMock: ReturnType<typeof vi.fn>
  let configStore: { get: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn> }

  // invoke handler 按 sendEvent.id 收集：call = [context, eventa, handler]
  function handlers(): Map<string, (payload?: unknown) => unknown> {
    const map = new Map<string, (payload?: unknown) => unknown>()
    for (const call of defineInvokeHandlerMock.mock.calls) {
      const eventa = call[1] as { sendEvent?: { id: string }, id?: string }
      const key = eventa.sendEvent?.id ?? eventa.id!
      map.set(key, call[2] as (payload?: unknown) => unknown)
    }
    return map
  }

  function handlerFor(eventa: { sendEvent?: { id: string }, id?: string }) {
    return handlers().get(eventa.sendEvent?.id ?? eventa.id!)
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    context = createContext() as unknown as ServiceContext
    window = { id: 1 } as unknown as BrowserWindow
    localeMock = vi.fn()
    configStore = {
      get: vi.fn(() => ({ language: 'zh-Hans', ttsEngine: 'edge-tts' })),
      update: vi.fn(),
    }
    injecaResolveMock.mockResolvedValue({ config: configStore })
    await createI18nService({
      context,
      window,
      i18n: makeI18n(localeMock as unknown as (value: string) => void) as unknown as Parameters<typeof createI18nService>[0]['i18n'],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers set/get locale invoke handlers', () => {
    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(2)
    expect(handlers().size).toBe(2)
    expect(handlers().has(i18nSetLocale.sendEvent!.id)).toBe(true)
    expect(handlers().has(i18nGetLocale.sendEvent!.id)).toBe(true)
  })

  it('initializes locale from persisted config language', () => {
    // createI18nService 启动时用 config 的 language 调 i18n.locale
    expect(localeMock).toHaveBeenCalledWith('zh-Hans')
  })

  it('falls back to en when config is empty', async () => {
    vi.clearAllMocks()
    injecaResolveMock.mockResolvedValue({ config: { get: vi.fn(() => undefined), update: vi.fn() } })
    await createI18nService({ context, window, i18n: makeI18n(localeMock as unknown as (value: string) => void) as unknown as Parameters<typeof createI18nService>[0]['i18n'] })
    expect(localeMock).toHaveBeenCalledWith('en')
  })

  it('persists new locale while preserving other config fields', async () => {
    const handler = handlerFor(i18nSetLocale)!
    handler('en')

    expect(configStore.get).toHaveBeenCalled()
    // get() ?? {} 兜底：language 之外的字段（ttsEngine）保留
    expect(configStore.update).toHaveBeenCalledWith({ language: 'en', ttsEngine: 'edge-tts' })
    expect(localeMock).toHaveBeenLastCalledWith('en')
  })

  it('does not wipe other fields when config get() returns undefined', async () => {
    configStore.get.mockReturnValue(undefined)
    const handler = handlerFor(i18nSetLocale)!
    handler('ja')
    expect(configStore.update).toHaveBeenCalledWith({ language: 'ja' })
  })

  it('returns current locale from get handler', async () => {
    const handler = handlerFor(i18nGetLocale)!
    expect(handler()).toBe('zh-Hans')
  })

  it('returns undefined locale when config has no language', async () => {
    configStore.get.mockReturnValue({ ttsEngine: 'edge-tts' })
    const handler = handlerFor(i18nGetLocale)!
    expect(handler()).toBeUndefined()
  })
})