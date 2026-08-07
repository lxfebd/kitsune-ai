import type Redis from 'ioredis'

import type { Database } from './libs/db'
import type { Env } from './libs/env'
import type { OtelInstance } from './otel'
import type { ConfigKVService } from './services/adapters/config-kv'
import type { CharacterService } from './services/domain/characters'
import type { ChatService } from './services/domain/chats'
import type { FluxService } from './services/domain/flux'
import type { FluxTransactionService } from './services/domain/flux-transaction'
import type { FluxMeter } from './services/domain/billing/flux-meter'
import type { BillingService } from './services/domain/billing/billing-service'
import type { LlmRouterService } from './services/domain/llm-router'
import type { ProductEventService } from './services/domain/product-events'
import type { ProviderService } from './services/domain/providers'
import type { RequestLogService } from './services/domain/request-log'
import type { VoicePackService } from './services/domain/voice-packs'
import type { HonoEnv } from './types/hono'
import type { EnvelopeCrypto } from './utils/envelope-crypto'

import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { httpInstrumentationMiddleware } from '@hono/otel'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca, lifecycle } from 'injeca'

import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { createRedis } from './libs/redis'
import { emitOtelLog, initOtel } from './otel'
import { registerTtsPoolGauge } from './otel/gauges/tts-pool'
import { createAudioSpeechWsHandlers } from './routes/audio-speech-ws'
import { createAudioTranscriptionStreamHandler } from './routes/audio-transcription-stream/route'
import { createAdminRoutes } from './routes/admin'
import { createAdminFluxGrantsRoutes } from './routes/admin/flux-grants'
import { createCharacterRoutes } from './routes/characters'
import { createChatWsHandlers } from './routes/chat-ws'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createV1Routes } from './routes/openai/v1'
import { createProviderRoutes } from './routes/providers'
import { createVoicePackRoutes } from './routes/voice-packs'
import { createAuthGuard } from './middlewares/auth'
import { createConfigKVService } from './services/adapters/config-kv'
import { createCharacterService } from './services/domain/characters'
import { createChatService } from './services/domain/chats'
import { createFluxService } from './services/domain/flux'
import { createFluxTransactionService } from './services/domain/flux-transaction'
import { createConcurrencyLedger, createConfigSyncSubscriber, createLlmRouterService } from './services/domain/llm-router'
import { createProductEventService } from './services/domain/product-events'
import { createProviderService } from './services/domain/providers'
import { createRequestLogService } from './services/domain/request-log'
import { createVoicePackService } from './services/domain/voice-packs'
import { createEnvelopeCrypto } from './utils/envelope-crypto'
import { ApiError, createInternalError } from './utils/error'
import { nanoid } from './utils/id'

interface AppDeps {
  db: Database
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  fluxTransactionService: FluxTransactionService
  requestLogService: RequestLogService
  voicePackService: VoicePackService
  productEventService: ProductEventService
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  redis: Redis
  env: Env
  otel: OtelInstance | null
  llmRouter: LlmRouterService
  billingService?: any
  adminFluxGrantsService?: any
  auth?: { api: { getSession: (ctx: any) => Promise<any> } }
}

// NOTICE:
// The app intentionally ships without login/billing (user-declared), but the WS
// and v1 routes call `ttsMeter`/`billingService` methods. Passing `{} as any`
// made every such call throw `TypeError: x is not a function`. These factories
// return typed no-ops so those routes behave as "meter disabled": the debit is
// always affordable and consumption records zero flux.
function createNoopFluxMeter(): FluxMeter {
  return {
    assertCanAfford: async () => {},
    accumulate: async () => ({ fluxDebited: 0, debtAfter: 0, balanceAfter: 0, unbilledFlux: 0 }),
    peekDebt: async () => 0,
    config: { name: 'noop', resolveRuntime: async () => ({ unitsPerFlux: 1, debtTtlSeconds: 86400 }) },
  }
}

function createNoopBillingService(): BillingService {
  return {
    consumeFluxForLLM: async () => ({ ok: true }),
    creditFlux: async () => ({ applied: true, balanceAfter: 0 }),
    setFlux: async () => ({ applied: true, balanceAfter: 0 }),
  } as unknown as BillingService
}

export async function buildApp(deps: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  // Create auth middleware that supports optional auth integration
  const authMiddleware = createAuthGuard(deps.auth)

  const app = new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      await next()

      // Non-cacheable responses for API
      c.res.headers.set('Cache-Control', 'no-store, no-cache, private, max-age=0')
      c.res.headers.set('Pragma', 'no-cache')
      c.res.headers.set('Expires', '0')
    })
    .use(
      '/api/*',
      cors({
        origin: '*',
        credentials: true,
      }),
    )
    .use(honoLogger())
    .use('/api/*', authMiddleware)

  if (deps.otel) {
    const otelMw = httpInstrumentationMiddleware({
      serviceName: deps.env.OTEL_SERVICE_NAME,
      serviceVersion: process.env.npm_package_version || '0.0.0',
    })
    app.use('*', async (c, next) => {
      if (c.req.path === '/livez' || c.req.path === '/readyz')
        return next()
      return otelMw(c, next)
    })
  }

  // WebSocket setup — must be registered BEFORE bodyLimit middleware
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
  const instanceId = process.env.SERVER_INSTANCE_ID || nanoid()
  const chatWsSetup = createChatWsHandlers(deps.chatService, deps.redis, instanceId, deps.otel?.engagement ?? null)

  app.get('/ws/chat', upgradeWebSocket(async () => {
    // Simplified: no auth check, direct connection
    return chatWsSetup('anonymous')
  }))

  // Bidirectional streaming TTS proxy
  const audioSpeechWsSetup = createAudioSpeechWsHandlers({
    configKV: deps.configKV,
    envelopeCrypto: deps.envelopeCrypto,
    fluxService: deps.fluxService,
    ttsMeter: createNoopFluxMeter(),
    requestLogService: deps.requestLogService,
    productEventService: deps.productEventService,
  })
  app.get('/api/v1/audio/speech/ws', upgradeWebSocket(async (c) => {
    // Simplified: no auth check, direct connection
    return audioSpeechWsSetup('anonymous', {
      trigger: c.req.query('tts_trigger') === 'auto' ? 'auto' : 'manual',
      source: parseTtsSource(c.req.query('tts_source'), 'audio.speech.ws'),
    })
  }))

  // Realtime ASR proxy
  app.post('/api/v1/audio/transcriptions/stream', createAudioTranscriptionStreamHandler({
    configKV: deps.configKV,
    envelopeCrypto: deps.envelopeCrypto,
  }))

  // Cross-instance config invalidation
  createConfigSyncSubscriber({
    redis: deps.redis,
    llmRouter: deps.llmRouter,
    gatewayMetrics: deps.otel?.gateway ?? null,
    instanceId: deps.env.OTEL_SERVICE_NAME,
    logger: useLogger('config-sync').useGlobalConfig(),
  })

  // Built once so the OpenAI-compat and audio routers share the same closure
  const v1Routes = createV1Routes({
    fluxService: deps.fluxService,
    billingService: createNoopBillingService(),
    configKV: deps.configKV,
    requestLogService: deps.requestLogService,
    productEventService: deps.productEventService,
    ttsMeter: createNoopFluxMeter(),
    llmRouter: deps.llmRouter,
    voicePackService: deps.voicePackService,
    genAi: deps.otel?.genAi,
    revenue: deps.otel?.revenue,
    rateLimitMetrics: deps.otel?.rateLimit,
  })

  const builtApp = app
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        const logFields = { details: err.details, cause: (err as { cause?: unknown }).cause }

        if (err.statusCode >= 500) {
          logger.withError(err).withFields(logFields).error('API error occurred')
        }
        else if (err.statusCode !== 401) {
          logger.withError(err).withFields(logFields).warn('API error occurred')
        }

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })

    /**
     * Liveness probe
     */
    .on('GET', '/livez', c => c.json({ status: 'live' }))
    /**
     * Readiness probe
     */
    .on('GET', '/readyz', async (c) => {
      const [dbResult, redisResult] = await Promise.allSettled([
        deps.db.execute('SELECT 1'),
        deps.redis.ping(),
      ])

      const dbReady = dbResult.status === 'fulfilled'
      const redisReady = redisResult.status === 'fulfilled'
      const ready = dbReady && redisReady

      return c.json(
        {
          status: ready ? 'ready' : 'not_ready',
          checks: { db: dbReady ? 'ok' : 'fail', redis: redisReady ? 'ok' : 'fail' },
        },
        ready ? 200 : 503,
      )
    })

    /**
     * Service identity
     */
    .on('GET', '/', c => c.json({
      service: 'kitsune-api',
      message: 'This is the Kitsune AI API server.',
    }))

    /**
     * Character routes
     */
    .route('/api/v1/characters', createCharacterRoutes(deps.characterService))

    /**
     * Provider routes
     */
    .route('/api/v1/providers', createProviderRoutes(deps.providerService))

    /**
     * Voice Pack routes
     */
    .route('/api/v1/voice-packs', createVoicePackRoutes(deps.voicePackService))

    /**
     * Chat routes
     */
    .route('/api/v1/chats', createChatRoutes(deps.chatService))

    /**
     * V1 OpenAI-compatible and audio routes
     */
    .route('/api/v1/openai', v1Routes.openaiRoutes)
    .route('/api/v1/audio', v1Routes.audioRoutes)

    /**
     * Flux routes
     */
    .route('/api/v1/flux', createFluxRoutes(deps.fluxService, deps.fluxTransactionService))

    /**
     * Admin routes
     */
    .route('/api/admin', createAdminRoutes({
      db: deps.db,
      billingService: deps.billingService ?? {} as any,
      configKV: deps.configKV,
    }))
    .route('/api/admin/flux-grants', createAdminFluxGrantsRoutes(
      deps.adminFluxGrantsService ?? {
        grant: async () => ({ summary: {}, result: [] }),
        preview: async () => ({ willGrant: 0, totalFluxToIssue: 0 }),
      } as any,
    ))

    /**
     * Catch-all 404
     */
    .notFound(c => c.json({
      error: 'NOT_FOUND',
      message: `No route matched ${c.req.method} ${new URL(c.req.url).pathname}.`,
    }, 404))

  return { app: builtApp, injectWebSocket }
}

function parseTtsSource(
  value: string | undefined,
  fallback: 'audio.speech.ws',
): 'audio.speech.ws' | 'chat_auto_tts' | 'manual_preview' | 'settings_test' {
  switch (value) {
    case 'chat_auto_tts':
    case 'manual_preview':
    case 'settings_test':
      return value
    default:
      return fallback
  }
}

export type AppType = Awaited<ReturnType<typeof buildApp>>['app']

export async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  // Forward logg output to OpenTelemetry log exporter
  setGlobalHookPostLog((log) => {
    emitOtelLog(log.level, log.context, log.message, log.fields as Record<string, string | number | boolean>)
  })

  const otel = injeca.provide('libs:otel', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => initOtel(dependsOn.env),
  })

  const db = injeca.provide('datastore:db', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const { db: dbInstance, pool } = await initializeExternalDependency(
        'Database',
        logger,
        async (attempt) => {
          const connection = createDrizzle(dependsOn.env)

          try {
            await connection.db.execute('SELECT 1')
            logger.log(`Connected to database on attempt ${attempt}`)
            await migrateDatabase(connection.db)
            logger.log(`Applied schema on attempt ${attempt}`)
            return connection
          }
          catch (error) {
            await connection.pool.end()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(() => pool.end())
      return dbInstance
    },
  })

  const redis = injeca.provide('datastore:redis', {
    dependsOn: { env: parsedEnv, lifecycle },
    build: async ({ dependsOn }) => {
      const redisInstance = await initializeExternalDependency(
        'Redis',
        logger,
        async (attempt) => {
          const instance = createRedis(dependsOn.env.REDIS_URL)

          try {
            await instance.connect()
            logger.log(`Connected to Redis on attempt ${attempt}`)
            return instance
          }
          catch (error) {
            instance.disconnect()
            throw error
          }
        },
      )

      dependsOn.lifecycle.appHooks.onStop(async () => {
        await redisInstance.quit()
      })
      return redisInstance
    },
  })

  const configKV = injeca.provide('datastore:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })

  const productEventService = injeca.provide('services:productEvents', {
    dependsOn: { db, otel },
    build: ({ dependsOn }) => createProductEventService(dependsOn.db, dependsOn.otel?.product),
  })

  const characterService = injeca.provide('services:characters', {
    dependsOn: { db, otel },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db, dependsOn.otel?.engagement),
  })

  const providerService = injeca.provide('services:providers', {
    dependsOn: { db },
    build: ({ dependsOn }) => createProviderService(dependsOn.db),
  })

  const chatService = injeca.provide('services:chats', {
    dependsOn: { db, otel, productEventService },
    build: ({ dependsOn }) => createChatService(dependsOn.db, dependsOn.otel?.engagement, dependsOn.productEventService),
  })

  const fluxTransactionService = injeca.provide('services:fluxTransaction', {
    dependsOn: { db },
    build: ({ dependsOn }) => createFluxTransactionService(dependsOn.db),
  })

  const fluxService = injeca.provide('services:flux', {
    dependsOn: { db, redis, configKV },
    build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.redis, dependsOn.configKV),
  })

  const requestLogService = injeca.provide('services:requestLog', {
    dependsOn: { db },
    build: ({ dependsOn }) => createRequestLogService(dependsOn.db),
  })

  const voicePackService = injeca.provide('services:voicePack', {
    dependsOn: { db },
    build: ({ dependsOn }) => createVoicePackService(dependsOn.db),
  })

  const envelopeCrypto = injeca.provide('libs:envelopeCrypto', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => createEnvelopeCrypto({
      masterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY,
      previousMasterKey: dependsOn.env.LLM_ROUTER_MASTER_KEY_PREVIOUS,
    }),
  })

  const ttsConcurrencyLedger = injeca.provide('services:ttsConcurrencyLedger', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConcurrencyLedger(dependsOn.redis),
  })

  const llmRouter = injeca.provide('services:llmRouter', {
    dependsOn: { configKV, envelopeCrypto, otel, redis, ttsConcurrencyLedger },
    build: ({ dependsOn }) => createLlmRouterService({
      configKV: dependsOn.configKV,
      envelopeCrypto: dependsOn.envelopeCrypto,
      gatewayMetrics: dependsOn.otel?.gateway ?? null,
      redis: dependsOn.redis,
      concurrencyLedger: dependsOn.ttsConcurrencyLedger,
    }),
  })

  await injeca.start()
  const resolved = await injeca.resolve({
    db,
    characterService,
    chatService,
    providerService,
    fluxService,
    fluxTransactionService,
    requestLogService,
    voicePackService,
    productEventService,
    configKV,
    envelopeCrypto,
    redis,
    env: parsedEnv,
    otel,
    llmRouter,
    ttsConcurrencyLedger,
  })

  if (resolved.otel) {
    registerTtsPoolGauge(resolved.otel.gateway.poolInflight, resolved.ttsConcurrencyLedger, resolved.otel.observability.metricReadErrors)
  }

  const { app, injectWebSocket } = await buildApp({
    db: resolved.db,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    fluxTransactionService: resolved.fluxTransactionService,
    voicePackService: resolved.voicePackService,
    requestLogService: resolved.requestLogService,
    productEventService: resolved.productEventService,
    configKV: resolved.configKV,
    envelopeCrypto: resolved.envelopeCrypto,
    redis: resolved.redis,
    env: resolved.env,
    otel: resolved.otel,
    llmRouter: resolved.llmRouter,
  })

  logger.withFields({ hostname: resolved.env.HOST, port: resolved.env.PORT }).log('Server started')

  return {
    app,
    injectWebSocket,
    port: resolved.env.PORT,
    hostname: resolved.env.HOST,
  }
}

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

export async function runApiServer(): Promise<void> {
  const { app: honoApp, injectWebSocket, port, hostname } = await createApp()
  const server = serve({ fetch: honoApp.fetch, port, hostname })
  injectWebSocket(server)

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolve, reject) => {
    server.once('close', () => resolve())
    server.once('error', error => reject(error))
  })
}
