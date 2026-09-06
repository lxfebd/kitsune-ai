import { describe, expect, it, vi } from 'vitest'

import { buildApp } from './app'

function createTestDeps() {
  const redisSubscriber = {
    on: vi.fn(),
    subscribe: vi.fn(async () => 1),
    unsubscribe: vi.fn(async () => 0),
  }

  const redis = {
    duplicate: vi.fn(() => redisSubscriber),
    publish: vi.fn(async () => 0),
  }

  const deps = {
    db: {} as any,
    characterService: {} as any,
    chatService: {} as any,
    providerService: {} as any,
    fluxService: {
      ttsMeter: {},
    } as any,
    fluxTransactionService: {} as any,
    requestLogService: {} as any,
    voicePackService: {} as any,
    productEventService: {
      track: vi.fn(async () => undefined),
      countDistinctUsersByFeature: vi.fn(async () => []),
    },
    configKV: {
      getOrThrow: vi.fn(async (key: string) => {
        switch (key) {
          default:
            throw new Error(`Unexpected config key: ${key}`)
        }
      }),
    } as any,
    redis: redis as any,
    env: {
      API_SERVER_URL: 'http://localhost:3000',
      OTEL_SERVICE_NAME: 'test-server',
    } as any,
    otel: null,
    llmRouter: {
      route: vi.fn(async () => new Response('{}', { status: 200 })),
      invalidateConfig: vi.fn(),
    } as any,
    envelopeCrypto: {
      encryptKey: vi.fn(),
      decryptKey: vi.fn(),
    } as any,
  }

  return {
    deps,
    redis,
  }
}

describe('app basic routes', () => {
  it('serves liveness probe', async () => {
    const { deps } = createTestDeps()
    const { app } = await buildApp(deps)

    const res = await app.request('/livez')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'live' })
  })

  it('serves service identity', async () => {
    const { deps } = createTestDeps()
    const { app } = await buildApp(deps)

    const res = await app.request('/')

    expect(res.status).toBe(200)
    const body = await res.json() as { service: string }
    expect(body.service).toBe('kitsune-api')
  })
})
