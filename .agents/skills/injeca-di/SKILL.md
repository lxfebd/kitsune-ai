---
name: injeca-di
description: >-
  Injeca dependency injection for Electron and Hono services. Use when creating
  services, managing dependencies, or working with the DI container in
  apps/stage-tamagotchi/src/main/ or apps/server/.
---

# Injeca Dependency Injection Guide

Guide for using the `injeca` DI container in the Kitsune project.

## When to Use

- Creating new services in Electron main process
- Setting up server dependencies
- Managing service lifecycles
- Testing services with mocked dependencies

## Core Pattern

Both the Electron main process and Hono server use `injeca` for dependency injection:

```typescript
import { injeca } from 'injeca'

// Register service with dependency
const config = injeca.provide('configs:app', () => createAppConfig())

const myService = injeca.provide('services:my-service', {
  dependsOn: { config },
  build: ({ dependsOn }) => createMyService(dependsOn.config),
})

// Start the container (resolves dependencies in topological order)
await injeca.start()
```

## Electron Main Process

### Entry Point Pattern

```typescript
// apps/stage-tamagotchi/src/main/index.ts
import { injeca } from 'injeca'

async function main() {
  // Configuration
  const appConfig = injeca.provide('configs:app', () => createGlobalAppConfig())

  // Infrastructure
  const db = injeca.provide('services:db', {
    dependsOn: { appConfig },
    build: ({ dependsOn }) => createDatabase(dependsOn.appConfig),
  })

  // Domain services
  const characterService = injeca.provide('services:character', {
    dependsOn: { db },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db),
  })

  // Start all services
  await injeca.start()

  // Use resolved services
  const characters = await characterService.list()
}

main().catch(console.error)
```

### Service Factory Pattern

```typescript
// services/kitsune/my-service.ts
import type { Database } from '../db'
import type { Logger } from '../logger'

export interface MyServiceDeps {
  db: Database
  logger: Logger
}

export function createMyService(deps: MyServiceDeps) {
  const { db, logger } = deps

  async function list() {
    logger.info('Listing items')
    return db.select().from(items)
  }

  async function getById(id: string) {
    logger.info(`Getting item ${id}`)
    return db.query.items.findFirst({ where: eq(items.id, id) })
  }

  return {
    list,
    getById,
  }
}

export type MyService = ReturnType<typeof createMyService>
```

## Hono Server

### App Factory Pattern

```typescript
// apps/server/src/app.ts
import { injeca } from 'injeca'
import { Hono } from 'hono'

export async function createApp() {
  // Infrastructure
  const config = injeca.provide('configs:app', () => loadConfig())
  const db = injeca.provide('services:db', {
    dependsOn: { config },
    build: ({ dependsOn }) => createDatabase(dependsOn.config),
  })
  const redis = injeca.provide('services:redis', {
    dependsOn: { config },
    build: ({ dependsOn }) => createRedisClient(dependsOn.config),
  })

  // Domain services
  const characterService = injeca.provide('services:character', {
    dependsOn: { db },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db),
  })

  // Start
  await injeca.start()

  // Build Hono app
  const app = new Hono()
  app.route('/api/characters', createCharacterRoutes(characterService))

  return app
}
```

## Naming Conventions

### Service Keys

```
configs:<name>           # Configuration objects
services:<name>          # Domain services
infrastructure:<name>    # Infrastructure (DB, Redis, etc.)
```

### Examples

```typescript
// Configuration
injeca.provide('configs:app', () => ({ ... }))
injeca.provide('configs:database', () => ({ ... }))

// Infrastructure
injeca.provide('services:db', { ... })
injeca.provide('services:redis', { ... })

// Domain
injeca.provide('services:character', { ... })
injeca.provide('services:chat', { ... })
injeca.provide('services:provider', { ... })
```

## Lifecycle Management

### Startup

```typescript
// Services are started in dependency order
await injeca.start()
```

### Cleanup/Dispose

```typescript
export function createMyService(deps: MyServiceDeps) {
  let connection: Connection | null = null

  async function init() {
    connection = await deps.db.connect()
  }

  async function dispose() {
    if (connection) {
      await connection.close()
      connection = null
    }
  }

  return {
    init,
    dispose,
    // ... other methods
  }
}
```

## Testing with Mocked Dependencies

### Mock Services

```typescript
// my-service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createMyService } from './my-service'

describe('MyService', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  }

  it('should list items', async () => {
    const service = createMyService({
      db: mockDb as any,
      logger: mockLogger as any,
    })

    const result = await service.list()
    expect(result).toEqual([])
    expect(mockLogger.info).toHaveBeenCalledWith('Listing items')
  })
})
```

### Mock DI Container

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock injeca
vi.mock('injeca', () => ({
  injeca: {
    provide: vi.fn((key, config) => {
      if (typeof config === 'function') {
        return config()
      }
      return config.build({ dependsOn: {} })
    }),
    start: vi.fn(),
  },
}))
```

## Best Practices

1. **Use factory functions** - `create*Service(deps)` pattern
2. **Type dependencies** - Create `*Deps` interfaces
3. **Export return type** - `type *Service = ReturnType<typeof create*Service>`
4. **Name keys clearly** - Use `configs:` and `services:` prefixes
5. **Keep factories pure** - No side effects in factory functions
6. **Clean up resources** - Implement `dispose()` when needed

## Checklist

- [ ] Create factory function `create*Service(deps)`
- [ ] Define `*Deps` interface for dependencies
- [ ] Export `*Service` return type
- [ ] Register with `injeca.provide()` using clear key
- [ ] Add `dispose()` for resources that need cleanup
- [ ] Test with mocked dependencies
