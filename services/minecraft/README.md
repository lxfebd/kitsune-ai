# Kitsune AI Minecraft Service

This workspace runs Kitsune AI's dedicated Minecraft bot. It connects a Mineflayer runtime to a Minecraft server, loads the cognitive stack in `src/cognitive`, and bridges status, context, and command traffic back to Kitsune AI so the Stage settings shell can observe the service.

## Safety Notice

Do not connect this bot to public servers you do not trust.

The runtime can execute JavaScript-generated action plans to control the bot. Those scripts run in an isolated environment, but they still drive a real local process with access to your Minecraft session, local network reachability, and other machine-side resources. A malicious or hostile server can still cause unwanted actions, or damage to your system.

Treat this service as a local-development and trusted-server tool only.

## Setup

1. Install workspace dependencies from the repo root:

   ```bash
   pnpm i
   ```

2. Copy the template:

   ```bash
   cp services/minecraft/.env services/minecraft/.env.local
   ```

3. Edit `services/minecraft/.env.local`.

4. Start the service:

   ```bash
   pnpm -F @kitsune/minecraft-bot dev
   ```

   Or, from `services/minecraft/`:

   ```bash
   pnpm dev
   ```

5. The bot should automatically connect to both Kitsune AI and the Minecraft server.

## Cognitive Architecture

Kitsune AI's Minecraft agent is built on a **four-layered cognitive architecture** inspired by cognitive science, enabling reactive, conscious, and physically grounded behaviors.

### Architecture Overview

```mermaid
graph TB
    subgraph "Layer A: Perception"
        Events[Raw Events]
        EM[Event Manager]
        Events --> EM
    end

    subgraph "Layer B: Reflex (Subconscious)"
        RM[Reflex Manager]
        FSM[State Machine]
        RM --> FSM
    end

    subgraph "Layer C: Conscious (Reasoning)"
        ORC[Orchestrator]
        Planner[Planning Agent (LLM)]
        Chat[Chat Agent (LLM)]
        ORC --> Planner
        ORC --> Chat
    end

    subgraph "Layer D: Action (Execution)"
        TE[Task Executor]
        AA[Action Agent]
        Planner -->|Plan| TE
        TE -->|Action Steps| AA
    end

    EM -->|High Priority| RM
    EM -->|All Events| ORC
    RM -.->|Inhibition Signal| ORC
    ORC -->|Execution Request| TE

    style EM fill:#e1f5ff
    style RM fill:#fff4e1
    style ORC fill:#ffe1f5
    style TE fill:#dcedc8
```

### Layer A: Perception

**Location**: `src/cognitive/perception/`

The perception layer acts as the sensory input hub, collecting raw Mineflayer signals and translating them into typed events/signals through an event registry + rule engine pipeline.

### Layer B: Reflex

**Location**: `src/cognitive/reflex/`

The reflex layer handles immediate, instinctive reactions. It operates on a finite state machine (FSM) pattern for predictable, fast responses.

### Layer C: Conscious

**Location**: `src/cognitive/conscious/`

The conscious layer handles complex reasoning, planning, and high-level decision-making. No physical execution happens here anymore.

### Layer D: Action

**Location**: `src/cognitive/action/`

The action layer is responsible for the actual execution of tasks in the world. It isolates "Doing" from "Thinking".

## Design Principles

1. **Separation of Concerns**: Each layer has a distinct responsibility
2. **Event-Driven**: Loose coupling via centralized event system
3. **Inhibition Control**: Reflexes prevent unnecessary LLM calls
4. **Extensibility**: Easy to add new reflexes or conscious behaviors
5. **Cognitive Realism**: Mimics human-like perception → reaction → deliberation

## Development

- `pnpm dev` - Start the bot in development mode
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run tests
