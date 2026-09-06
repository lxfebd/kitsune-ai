---
name: ai-agent-dev
description: AI agent and LLM integration development. Use when working with core-agent, LLM providers, tool calling, or chat orchestration in packages/core-agent or apps/server.
---

# AI Agent Development

Guide for developing AI agent features in Kitsune AI.

## When to Use

- Adding new LLM providers
- Implementing tool calling
- Modifying chat orchestration
- Working with the streaming system
- Adding context providers

## Core Architecture

```
packages/core-agent/src/
├── contracts/           # Port interfaces
│   ├── llm-port.ts     # LLM streaming interface
│   ├── context-port.ts # Context management
│   ├── session-port.ts # Session persistence
│   └── hook-types.ts   # Lifecycle hooks
├── runtime/             # Core runtime
│   ├── chat-orchestrator-runtime.ts  # Main orchestrator
│   ├── llm-service.ts                # LLM abstraction
│   └── context-registry.ts           # Context management
└── messages/            # Message processing
```

## Adding a New Tool

### 1. Define Tool Schema

```typescript
// tools/my-tool.ts
import { z } from 'zod'

export const myToolSchema = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().optional().default(10)
})

export type MyToolInput = z.infer<typeof myToolSchema>
```

### 2. Implement Tool Handler

```typescript
// tools/my-tool.ts
export async function executeMyTool(input: MyToolInput) {
  const { query, limit } = input
  
  // Implementation
  const results = await search(query, limit)
  
  return {
    content: JSON.stringify(results),
    isError: false
  }
}
```

### 3. Register Tool

```typescript
// In tool registration
import { executeMyTool, myToolSchema } from './tools/my-tool'

const tools = {
  my_tool: {
    description: 'Search for information',
    parameters: myToolSchema,
    execute: executeMyTool
  }
}
```

## Adding a Context Provider

```typescript
// context/my-context.ts
import type { ContextProvider } from '@kitsune/core-agent'

export function createMyContext(): ContextProvider {
  return {
    id: 'my-context',
    async getSnapshot() {
      return {
        key: 'my-context',
        value: await getContextData()
      }
    }
  }
}
```

## Chat Orchestrator Hooks

Use lifecycle hooks for custom behavior:

```typescript
import type { ChatHookRegistry } from '@kitsune/core-agent'

const hooks: Partial<ChatHookRegistry> = {
  // Before message is sent to LLM
  beforeMessageComposed: async (message) => {
    // Modify message
    return message
  },

  // On each token from LLM
  onTokenLiteral: async (token) => {
    // Track tokens
  },

  // After stream completes
  onStreamEnd: async () => {
    // Cleanup
  },

  // After full response
  onChatTurnComplete: async (response) => {
    // Post-processing
  }
}
```

## LLM Provider Integration

### Provider Configuration

```typescript
// providers/my-provider.ts
import type { LLMProvider } from '@kitsune/core-agent'

export function createMyProvider(config: MyProviderConfig): LLMProvider {
  return {
    id: 'my-provider',
    name: 'My Provider',
    async stream(model, messages, options) {
      // Implement streaming
      return new ReadableStream({
        start(controller) {
          // Stream chunks
        }
      })
    }
  }
}
```

### Auto-Degradation

The system auto-degrades for incompatible providers:

```typescript
// In llm-service.ts patterns
const DEGRADE_PATTERNS = [
  /tool.*not.*supported/i,
  /content.*array.*not.*supported/i
]
```

## Server-Side LLM Router

For multi-upstream routing in `apps/server`:

```typescript
// services/domain/llm-router/router.ts
const router = {
  async route(request) {
    // 1. Load config from Redis
    // 2. Find model config
    // 3. Walk upstreams with key rotation
    // 4. Handle errors with fallback
  }
}
```

## Testing AI Features

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('MyTool', () => {
  it('executes correctly', async () => {
    const result = await executeMyTool({
      query: 'test',
      limit: 5
    })

    expect(result.isError).toBe(false)
    expect(JSON.parse(result.content)).toHaveLength(5)
  })

  it('handles errors gracefully', async () => {
    const result = await executeMyTool({
      query: ''
    })

    expect(result.isError).toBe(true)
  })
})
```

## Key Imports

```typescript
// Core agent
import { createChatOrchestratorRuntime } from '@kitsune/core-agent/runtime'
import { createContextRegistry } from '@kitsune/core-agent/runtime'

// xsAI (LLM abstraction)
import { streamText } from '@xsai/stream-text'
import { tool } from '@xsai/tool'

// Server SDK
import { Client } from '@kitsune/server-sdk'
```

## Checklist

- [ ] Define tool schemas with Zod
- [ ] Handle errors in tool execution
- [ ] Use hooks for lifecycle events
- [ ] Test with mock LLM responses
- [ ] Follow auto-degradation patterns
- [ ] Document provider quirks
