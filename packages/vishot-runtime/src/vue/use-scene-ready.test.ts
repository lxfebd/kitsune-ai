// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'

const readyMocks = vi.hoisted(() => ({
  markScenarioReady: vi.fn(),
  resetScenarioReady: vi.fn(),
}))

vi.mock('../runtime/ready', () => ({
  markScenarioReady: readyMocks.markScenarioReady,
  resetScenarioReady: readyMocks.resetScenarioReady,
}))

class MockImage {
  private _src = ''

  addEventListener(type: string, listener: () => void): void {
    if (type === 'load') {
      queueMicrotask(listener)
    }
  }

  set src(value: string) {
    this._src = value
  }

  get src(): string {
    return this._src
  }
}

describe('useSceneReady', () => {
  // 全量并发时 jsdom 环境加载 + 微任务链较慢，默认 5000ms 偶发超时（单跑约 2.2s），显式放宽。
  it('resets first and marks ready after fonts and image sources resolve', async () => {
    const originalImage = globalThis.Image
    const originalFonts = document.fonts

    // @ts-expect-error test shim
    globalThis.Image = MockImage
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: Promise.resolve(),
      },
    })

    const { useSceneReady } = await import('./index')

    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp({
      setup() {
        useSceneReady(['a.png', 'b.png'])
        return () => h('div')
      },
    })

    app.mount(host)
    await Promise.resolve()
    await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(readyMocks.resetScenarioReady).toHaveBeenCalledTimes(1)
    expect(readyMocks.markScenarioReady).toHaveBeenCalledTimes(1)

    app.unmount()
    host.remove()

    if (originalImage) {
      globalThis.Image = originalImage
    }
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: originalFonts,
    })
  }, 10_000)
})
