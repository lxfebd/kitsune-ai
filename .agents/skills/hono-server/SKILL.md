---
name: hono-server
description: >-
  Hono backend server development for @kitsune/server. Use when creating routes,
  middleware, WebSocket handlers, OpenAI-compatible gateway endpoints, or working
  with Hono framework in apps/server/.
---

# Hono Server Development

Guide for developing the Hono backend server in `apps/server`.

## When to Use

- Creating new API routes or endpoints
- Adding middleware (auth, rate-limiting, telemetry)
- Implementing WebSocket handlers
- Building OpenAI-compatible gateway endpoints
- Working with Hono context, request/response
- Debugging server issues

## Core Architecture

```
apps/server/src/
├── app.ts                    # App factory (createApp, buildApp)
├── bin/
│   └── run.ts                # CLI entry point
├── routes/                   # Route modules
│   ├── characters/           # Character CRUD
│   ├── providers/            # Provider management
│   ├── openai/v1/            # OpenAI-compatible gateway
│   │   ├── gateway.ts        # Gateway middleware pipeline
│   │   └── operations/       # Operation handlers
│   ├── chat-ws/              # WebSocket chat
│   └── stripe/               # Payment routes
├── services/
│   ├── adapters/             # External service adapters
│   └── domain/               # Business logic services
├── middlewares/               # Hono middleware
├── schemas/                  # Drizzle ORM schemas
└── types/                    # TypeScript types
```

## Route Factory Pattern

Every route module exports a factory function returning a Hono sub-router:

```typescript
// routes/my-feature/index.ts
import { Hono } from 'hono'
import type { MyFeatureService } from '../../services/domain/my-feature'

export function createMyFeatureRoutes(service: MyFeatureService) {
  const routes = new Hono()

  routes.get('/', async (c) => {
    const items = await service.list()
    return c.json({ items })
  })

  routes.get('/:id', async (c) => {
    const id = c.req.param('id')
    const item = await service.getById(id)
    if (!item) {
      return c.json({ error: 'Not found' }, 404)
    }
    return c.json(item)
  })

  routes.post('/', async (c) => {
    const body = await c.req.json()
    const item = await service.create(body)
    return c.json(item, 201)
  })

  return routes
}
```

## Request Validation with Valibot

Use Valibot for schema validation:

```typescript
import { object, string, number, parse } from 'valibot'

const CreateItemSchema = object({
  name: string(),
  count: number(),
})

routes.post('/', async (c) => {
  const body = await c.req.json()
  const validated = parse(CreateItemSchema, body)
  const item = await service.create(validated)
  return c.json(item, 201)
})
```

## Middleware Pattern

```typescript
// middlewares/my-middleware.ts
import type { MiddlewareHandler } from 'hono'

export function myMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    // Pre-processing
    const startTime = Date.now()

    await next()

    // Post-processing
    const duration = Date.now() - startTime
    c.header('X-Response-Time', `${duration}ms`)
  }
}

// Usage in routes
routes.use('*', myMiddleware())
```

## OpenAI-Compatible Gateway

The gateway pattern uses operation-scoped middleware:

```typescript
// routes/openai/v1/gateway.ts
import { Hono } from 'hono'

export function createV1Gateway(deps: GatewayDeps) {
  const gateway = new Hono()

  // Operation-specific middleware chain
  gateway.use('/chat/completions', billingMiddleware())
  gateway.use('/chat/completions', telemetryMiddleware())
  gateway.use('/chat/completions', trafficControlMiddleware())

  // Mount operations
  gateway.route('/chat/completions', createChatCompletionsRoutes(deps))
  gateway.route('/audio/speech', createSpeechRoutes(deps))

  return gateway
}
```

## WebSocket Routes

```typescript
// routes/chat-ws/index.ts
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/ws'

export function createChatWsRoutes() {
  const routes = new Hono()

  routes.get(
    '/ws',
    upgradeWebSocket((c) => {
      return {
        onOpen(event, ws) {
          // Handle connection
        },
        onMessage(event, ws) {
          const data = JSON.parse(event.data)
          // Handle message
        },
        onClose(event, ws) {
          // Cleanup
        },
      }
    })
  )

  return routes
}
```

## Service Dependency Injection

Routes receive services via the factory pattern:

```typescript
// app.ts
import { createCharacterRoutes } from './routes/characters'
import { createChatRoutes } from './routes/chats'

export function buildApp(deps: AppDeps) {
  const app = new Hono()

  // Mount routes with injected services
  app.route('/api/characters', createCharacterRoutes(deps.characterService))
  app.route('/api/chats', createChatRoutes(deps.chatService))

  return app
}
```

## Error Handling

Use `@moeru/std` for error messages:

```typescript
import { errorMessageFrom } from '@moeru/std'

routes.get('/:id', async (c) => {
  try {
    const item = await service.getById(c.req.param('id'))
    return c.json(item)
  } catch (error) {
    return c.json(
      { error: errorMessageFrom(error) ?? 'Internal server error' },
      500
    )
  }
})
```

## Testing Routes

Use Hono's built-in test helper:

```typescript
import { describe, it, expect } from 'vitest'
import { createMyFeatureRoutes } from './index'

describe('My Feature Routes', () => {
  const mockService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: '1' }),
  }

  const app = createMyFeatureRoutes(mockService)

  it('should list items', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
  })

  it('should return 404 for missing item', async () => {
    const res = await app.request('/nonexistent')
    expect(res.status).toBe(404)
  })
})
```

## OpenTelemetry Integration

```typescript
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('my-service')

routes.post('/', async (c) => {
  return tracer.startActiveSpan('create-item', async (span) => {
    try {
      const item = await service.create(body)
      span.setStatus({ code: SpanStatusCode.OK })
      return c.json(item, 201)
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) })
      throw error
    } finally {
      span.end()
    }
  })
})
```

## Checklist

- [ ] Export factory function `create*Routes(service)`
- [ ] Use Valibot for request validation
- [ ] Use `errorMessageFrom` from `@moeru/std` for error handling
- [ ] Add OpenTelemetry spans for critical operations
- [ ] Write tests using `app.request()` pattern
- [ ] Follow existing route structure in `routes/`
