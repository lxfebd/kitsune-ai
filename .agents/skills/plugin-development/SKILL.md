---
name: plugin-development
description: Plugin and extension development for Kitsune AI. Use when creating plugins, extensions, or working with the plugin-sdk and plugin-protocol packages.
---

# Plugin Development

Guide for developing plugins and extensions for Kitsune AI.

## When to Use

- Creating new plugins
- Working with `packages/plugin-sdk`
- Understanding `packages/plugin-protocol`
- Building IDE extensions (VSCode/IntelliJ)

## Architecture

```
packages/
├── plugin-protocol/     # Type definitions (51K+ lines)
├── plugin-sdk/          # Plugin SDK
│   ├── extension/       # Extension definition
│   ├── kit/             # Kit system
│   └── plugin-host/     # Host implementation
└── plugin-sdk-tamagotchi/  # Tamagotchi-specific SDK
```

## Creating an Extension

### 1. Define Extension

```typescript
// my-extension/index.ts
import { defineExtension } from '@kitsune/plugin-sdk'

export default defineExtension({
  id: 'my-extension',
  version: '1.0.0',
  
  async setup(ctx) {
    // Access kits
    const agentKit = ctx.kits.use(agentKitRef)
    
    if (agentKit.availability === 'available') {
      // Use kit
    }
    
    // Register cleanup
    ctx.subscriptions.add({
      dispose: () => {
        // Cleanup logic
      }
    })
  }
})
```

### 2. Define Kit (Optional)

```typescript
// my-kit/index.ts
import { defineKit } from '@kitsune/plugin-sdk'

export const myKitRef = defineKit<{
  doSomething(): Promise<void>
  getData(): Promise<Data>
}>({
  id: 'my-kit',
  version: '1.0.0',
  allowedExposePolicies: ['local-only', 'remote-callable'],
  
  createClient(runtime) {
    return {
      async doSomething() {
        // Implementation
      },
      async getData() {
        return await fetchData()
      }
    }
  }
})
```

### 3. Create Manifest

```json
{
  "kitsune": {
    "manifestVersion": 1,
    "id": "my-extension",
    "version": "1.0.0",
    "name": "My Extension",
    "description": "Description here",
    "entrypoints": {
      "electron": "./dist/electron.js",
      "web": "./dist/web.js"
    },
    "permissions": {
      "apis": ["agent.*"],
      "resources": ["character.read"]
    }
  }
}
```

## Extension Lifecycle

```
1. Host loads manifest (extension.kitsune.json)
2. Host validates permissions
3. Host creates ExtensionSetupContext
4. Extension.setup(ctx) is called
5. Extension registers kits, subscriptions
6. Extension is active
7. On unload: subscriptions.dispose() called
```

## Kit Exposure Policies

| Policy | Description |
|--------|-------------|
| `local-only` | Only available in same process |
| `remote-observable` | Can be observed remotely |
| `remote-callable` | Can be called remotely via RPC |

## Permission System

Two-layer model:

1. **Extension-level** - Maximum permissions granted
2. **Module-level** - Actual permissions used (intersection)

```typescript
// In manifest
{
  "permissions": {
    "apis": ["agent.*", "character.read"],
    "resources": ["*"],
    "capabilities": ["tts.synthesize"]
  }
}
```

## IDE Extensions

### VSCode Extension

```typescript
// vscode/extension.ts
import * as vscode from 'vscode'
import { Client } from '@kitsune/server-sdk'

export function activate(context: vscode.ExtensionContext) {
  const client = new Client({
    url: 'ws://localhost:3000'
  })
  
  context.subscriptions.push(
    vscode.commands.registerCommand('kitsune.connect', async () => {
      await client.connect()
    })
  )
}
```

### IntelliJ Plugin (Kotlin)

```kotlin
// KitsunePlugin.kt
class KitsunePlugin : ProjectActivity {
    override suspend fun execute(project: Project) {
        val client = KitsuneClient("ws://localhost:3000")
        client.connect()
    }
}
```

## MCP Integration

MCP tools are bridged to local tools:

```typescript
// MCP tool naming convention
const toolName = `mcp_${serverName}_${toolName}`

// Tools are cached for 30 seconds
```

## Testing Extensions

```typescript
import { describe, it, expect } from 'vitest'
import { ExtensionHost } from '@kitsune/plugin-sdk/plugin-host'

describe('MyExtension', () => {
  it('loads correctly', async () => {
    const host = new ExtensionHost()
    await host.loadExtensionFor('./my-extension')
    
    const extension = host.getExtension('my-extension')
    expect(extension).toBeDefined()
  })
})
```

## Checklist

- [ ] Create `extension.kitsune.json` manifest
- [ ] Define extension with `defineExtension()`
- [ ] Handle cleanup in `subscriptions`
- [ ] Declare permissions in manifest
- [ ] Test with ExtensionHost
- [ ] Support appropriate runtimes (electron/web/node)
