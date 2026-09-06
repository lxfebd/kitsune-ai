---
name: electron-main-process
description: Electron main process development for stage-tamagotchi. Use when working with IPC, windows, services, tray, or Electron-specific features in apps/stage-tamagotchi/src/main/.
---

# Electron Main Process Development

Guide for developing the Electron main process in `apps/stage-tamagotchi`.

## When to Use

- Adding new IPC handlers
- Creating new windows
- Setting up services
- Working with Electron APIs (dialog, tray, shortcuts)
- Debugging main process issues

## Architecture

```
apps/stage-tamagotchi/src/main/
├── index.ts           # Entry point (~35K lines)
├── app/               # App utilities (logger, debugger, single-instance)
├── configs/           # Configuration factories
├── libs/              # Shared libraries
├── services/          # Domain services
│   ├── electron/      # Electron-specific services
│   └── kitsune/       # Kitsune domain services
├── tray/              # System tray
└── windows/           # Window managers
```

## IPC with Eventa

Always use `@moeru/eventa` for type-safe IPC:

### Define Event (shared/eventa/)

```typescript
// shared/eventa/my-feature.ts
import { defineInvokeEventa } from '@moeru/eventa'

export const myFeatureGetData = defineInvokeEventa<
  { id: string },      // Input
  { data: string }     // Output
>('my-feature:get-data')
```

### Handle in Main

```typescript
// main/services/kitsune/my-feature.ts
import { defineInvokeHandler } from '@moeru/eventa'
import { myFeatureGetData } from '../../shared/eventa/my-feature'

export function setupMyFeature(context: ElectronMainContext) {
  defineInvokeHandler(context, myFeatureGetData, async (input) => {
    // Implementation
    return { data: 'result' }
  })
}
```

### Use in Renderer

```vue
<script setup lang="ts">
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { myFeatureGetData } from '../../../shared/eventa/my-feature'

const getData = useElectronEventaInvoke(myFeatureGetData)

async function loadData() {
  const result = await getData({ id: '123' })
  // Use result.data
}
</script>
```

## Window Management

Window setup pattern:

```typescript
// windows/my-window.ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export function setupMyWindow() {
  let window: BrowserWindow | null = null

  function create() {
    if (window) {
      window.focus()
      return window
    }

    window = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    window.on('closed', () => {
      window = null
    })

    return window
  }

  return { create, getWindow: () => window }
}
```

## Dependency Injection

Use `injeca` for services:

```typescript
import { injeca } from 'injeca'

// Register service
injeca.register('myService', () => createMyService())

// Use in another service
const myService = injeca.resolve('myService')
```

## Error Handling

Use `@moeru/std` for error messages:

```typescript
import { errorMessageFrom } from '@moeru/std'

try {
  await riskyOperation()
} catch (error) {
  log.error(errorMessageFrom(error) ?? 'Unknown error')
}
```

## Logging

Use `@guiiai/logg`:

```typescript
import { useLogg } from '@guiiai/logg'

const log = useLogg('my-module').useGlobalConfig()

log.info('Operation started')
log.error('Operation failed', { error })
```

## Checklist

- [ ] Define events in `shared/eventa/`
- [ ] Use `defineInvokeHandler` for IPC
- [ ] Use `injeca` for dependency injection
- [ ] Use `@guiiai/logg` for logging
- [ ] Use `errorMessageFrom` for error handling
- [ ] Clean up resources in `dispose()` methods
