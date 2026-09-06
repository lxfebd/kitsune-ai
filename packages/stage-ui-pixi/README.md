# @kitsune/stage-ui-pixi

Pixi.js rendering components and composables for Project Kitsune.

## Features

- Vue 3 composables for Pixi.js integration
- Automatic lifecycle management
- TypeScript support
- Scene management utilities

## Usage

### Basic Setup

```vue
<script setup>
import { PixiScene } from '@kitsune/stage-ui-pixi'

function onReady(app, stage) {
  console.log('Pixi.js app ready')
}
</script>

<template>
  <PixiScene
    :width="800"
    :height="600"
    :background-color="0x1a1a2e"
    @ready="onReady"
  />
</template>
```

### Using Composables

```vue
<script setup>
import { ref } from 'vue'
import { usePixiApp, usePixiScene } from '@kitsune/stage-ui-pixi'

const canvas = ref(null)
const { app, stage, isReady } = usePixiApp({ canvas })
const { scene, addChild, removeChild } = usePixiScene({ stage, isReady })
</script>

<template>
  <canvas ref="canvas" />
</template>
```

## API Reference

### Components

- `PixiScene` - Main scene component with canvas rendering

### Composables

- `usePixiApp` - Create and manage a Pixi.js Application
- `usePixiScene` - Manage scene containers and children

### Types

- `UsePixiAppOptions` - Options for `usePixiApp`
- `UsePixiAppReturn` - Return type for `usePixiApp`
- `UsePixiSceneOptions` - Options for `usePixiScene`
- `UsePixiSceneReturn` - Return type for `usePixiScene`
