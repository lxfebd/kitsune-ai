---
name: electron-ipc-rpc
description: >-
  Electron IPC/RPC communication using @moeru/eventa. Use when defining IPC events,
  creating type-safe communication between main and renderer processes, or working
  with shared/eventa/ contracts.
---

# Electron IPC/RPC with Eventa

Guide for type-safe Electron IPC communication using `@moeru/eventa`.

## When to Use

- Defining new IPC events between main and renderer
- Creating type-safe RPC calls
- Working with `shared/eventa/` contracts
- Debugging IPC communication issues
- Adding new Electron API wrappers

## Core Architecture

```
apps/stage-tamagotchi/
├── src/
│   ├── shared/
│   │   └── eventa/
│   │       ├── index.ts           # Central contract file (~1000 lines)
│   │       ├── electron/
│   │       │   ├── window.ts      # Window API events
│   │       │   ├── app.ts         # App API events
│   │       │   └── system.ts      # System API events
│   │       └── features/
│   │           ├── plugins.ts     # Plugin events
│   │           ├── memory.ts      # Memory events
│   │           └── tts.ts         # TTS events
│   ├── main/
│   │   └── services/electron/     # Main process handlers
│   └── renderer/
│       └── composables/           # Renderer composables
└── packages/
    └── electron-eventa/           # Shared Eventa package
```

## Event Definition

### One-Way Event (emit/on)

```typescript
// shared/eventa/my-feature.ts
import { defineEventa } from '@moeru/eventa'

// Event with payload
export const myFeatureStatusChanged = defineEventa<{
  status: 'active' | 'inactive'
  timestamp: number
}>('eventa:event:my-feature:status-changed')

// Event without payload
export const myFeatureReady = defineEventa<void>('eventa:event:my-feature:ready')
```

### Invoke Event (request/response RPC)

```typescript
// shared/eventa/my-feature.ts
import { defineInvokeEventa } from '@moeru/eventa'

// Request with input and output types
export const myFeatureGetData = defineInvokeEventa<
  { id: string },           // Input type
  { data: string; count: number }  // Output type
>('eventa:invoke:my-feature:get-data')

// Request without input
export const myFeatureGetStatus = defineInvokeEventa<
  void,                     // No input
  { status: string }        // Output type
>('eventa:invoke:my-feature:get-status')
```

### Grouped Events

```typescript
// shared/eventa/electron/window.ts
import { defineInvokeEventa } from '@moeru/eventa'

export const window = {
  getBounds: defineInvokeEventa<ReturnType<BrowserWindow['getBounds']>>(
    'eventa:invoke:electron:window:get-bounds'
  ),
  setBounds: defineInvokeEventa<void, Parameters<BrowserWindow['setBounds']>>(
    'eventa:invoke:electron:window:set-bounds'
  ),
  isVisible: defineInvokeEventa<boolean>(
    'eventa:invoke:electron:window:is-visible'
  ),
}
```

## Main Process Handler

```typescript
// main/services/kitsune/my-feature.ts
import { defineInvokeHandler } from '@moeru/eventa'
import { myFeatureGetData, myFeatureGetStatus } from '../../shared/eventa/my-feature'
import type { ElectronMainContext } from '../../types'

export function setupMyFeature(context: ElectronMainContext) {
  // Handle RPC call
  defineInvokeHandler(context, myFeatureGetData, async (input) => {
    // input is typed as { id: string }
    const data = await fetchDataById(input.id)
    // Return typed as { data: string; count: number }
    return { data: data.name, count: data.items.length }
  })

  // Handle RPC without input
  defineInvokeHandler(context, myFeatureGetStatus, async () => {
    return { status: 'active' }
  })

  // Emit one-way event
  context.emit(myFeatureStatusChanged, {
    status: 'active',
    timestamp: Date.now(),
  })
}
```

## Renderer Composable

```typescript
// renderer/composables/use-my-feature.ts
import { useElectronEventaInvoke, useElectronEventaOn } from '@kitsune/electron-vueuse'
import { myFeatureGetData, myFeatureStatusChanged } from '../../../shared/eventa/my-feature'

export function useMyFeature() {
  // Create invoke function
  const getData = useElectronEventaInvoke(myFeatureGetData)

  // Listen for events
  const { data: status, cleanup } = useElectronEventaOn(myFeatureStatusChanged)

  async function loadData(id: string) {
    // Typed call with input and output
    const result = await getData({ id })
    return result.data
  }

  return {
    status,
    loadData,
    cleanup,
  }
}
```

## Vue Component Usage

```vue
<script setup lang="ts">
import { onUnmounted } from 'vue'
import { useMyFeature } from '../composables/use-my-feature'

const { status, loadData, cleanup } = useMyFeature()

onUnmounted(cleanup)
</script>

<template>
  <div>
    <p>Status: {{ status?.status }}</p>
    <button @click="loadData('123')">Load Data</button>
  </div>
</template>
```

## Naming Conventions

### Event Type Prefixes

```
eventa:event:<domain>:<action>          # One-way events
eventa:invoke:<domain>:<action>         # RPC invoke events
```

### Domain Examples

```
eventa:event:electron:auto-updater:state-changed
eventa:invoke:electron:app:is-macos
eventa:event:plugins:status-changed
eventa:invoke:memory:get-all
eventa:event:tts:engines-updated
```

## Error Handling

```typescript
// Main process - throw errors
defineInvokeHandler(context, myFeatureGetData, async (input) => {
  if (!input.id) {
    throw new Error('ID is required')
  }
  // ...
})

// Renderer - catch errors
async function loadData(id: string) {
  try {
    const result = await getData({ id })
    return result
  } catch (error) {
    console.error('IPC call failed:', error)
    throw error
  }
}
```

## Testing

### Mock Eventa Context

```typescript
import { describe, it, expect, vi } from 'vitest'
import { setupMyFeature } from './my-feature'

describe('My Feature IPC', () => {
  const mockContext = {
    on: vi.fn(),
    emit: vi.fn(),
    handle: vi.fn(),
  }

  it('should register handlers', () => {
    setupMyFeature(mockContext as any)
    expect(mockContext.handle).toHaveBeenCalled()
  })
})
```

### Mock Renderer Composable

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@kitsune/electron-vueuse', () => ({
  useElectronEventaInvoke: vi.fn(() => vi.fn()),
  useElectronEventaOn: vi.fn(() => ({
    data: { value: null },
    cleanup: vi.fn(),
  })),
}))
```

## Best Practices

1. **Define all contracts in `shared/eventa/`** - single source of truth
2. **Use descriptive naming** - include domain and action
3. **Type both input and output** for invoke events
4. **Handle errors** in both main and renderer
5. **Clean up listeners** in renderer with `onUnmounted`
6. **Group related events** into objects (e.g., `window.*`, `app.*`)

## Checklist

- [ ] Define events in `shared/eventa/`
- [ ] Use `defineEventa` for one-way events
- [ ] Use `defineInvokeEventa` for RPC calls
- [ ] Handle in main with `defineInvokeHandler`
- [ ] Use composables in renderer
- [ ] Clean up listeners on unmount
- [ ] Follow naming conventions
