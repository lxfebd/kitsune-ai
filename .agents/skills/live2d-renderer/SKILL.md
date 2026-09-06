---
name: live2d-renderer
description: >-
  Live2D model rendering for Kitsune UI. Use when loading Live2D models,
  controlling expressions, eye tracking, or working with pixi-live2d-display
  in packages/stage-ui-live2d/.
---

# Live2D Rendering Guide

Guide for Live2D model rendering in the Kitsune project.

## When to Use

- Loading Live2D Cubism models
- Controlling model expressions and motions
- Implementing eye/mouse tracking
- Managing model physics
- Working with `pixi-live2d-display`

## Core Architecture

```
packages/stage-ui-live2d/
├── src/
│   ├── components/         # Vue Live2D components
│   ├── composables/        # Live2D composables
│   ├── loaders/            # Model loaders
│   └── utils/              # Live2D utilities
```

## Basic Model Loading

```typescript
// composables/use-live2d.ts
import { ref, onUnmounted } from 'vue'
import { Live2DModel } from 'pixi-live2d-display'
import * as PIXI from 'pixi.js'

export function useLive2D() {
  const model = ref<Live2DModel | null>(null)
  const isLoading = ref(false)
  const app = ref<PIXI.Application | null>(null)

  async function init(canvas: HTMLCanvasElement) {
    app.value = new PIXI.Application({
      view: canvas,
      transparent: true,
      autoStart: true,
    })
  }

  async function load(url: string) {
    if (!app.value) return
    isLoading.value = true

    try {
      model.value = await Live2DModel.from(url)
      app.value.stage.addChild(model.value)
    } finally {
      isLoading.value = false
    }
  }

  onUnmounted(() => {
    if (model.value) {
      model.value.destroy()
    }
    if (app.value) {
      app.value.destroy(true)
    }
  })

  return { model, isLoading, init, load }
}
```

## Expression Control

```typescript
// composables/use-live2d-expression.ts
import { ref, watch } from 'vue'
import type { Live2DModel } from 'pixi-live2d-display'

export function useLive2dExpression(model: Ref<Live2DModel | null>) {
  const currentExpression = ref<string>('')

  function setExpression(name: string) {
    if (!model.value) return
    model.value.expression(name)
    currentExpression.value = name
  }

  // Map emotions to expressions
  const emotionMap: Record<string, string> = {
    happy: 'happy',
    sad: 'sad',
    angry: 'angry',
    surprised: 'surprised',
    neutral: 'neutral',
  }

  function setEmotion(emotion: string) {
    const expression = emotionMap[emotion]
    if (expression) {
      setExpression(expression)
    }
  }

  return { currentExpression, setExpression, setEmotion }
}
```

## Motion Control

```typescript
// composables/use-live2d-motion.ts
import { ref } from 'vue'
import type { Live2DModel } from 'pixi-live2d-display'

export function useLive2dMotion(model: Ref<Live2DModel | null>) {
  const isPlaying = ref(false)

  function playMotion(group: string, index: number = 0) {
    if (!model.value) return
    isPlaying.value = true
    model.value.motion(group, index, {
      onFinish: () => { isPlaying.value = false },
    })
  }

  function playIdle() {
    playMotion('Idle', Math.floor(Math.random() * 3))
  }

  function playTap() {
    playMotion('TapBody')
  }

  return { isPlaying, playMotion, playIdle, playTap }
}
```

## Eye/Mouse Tracking

```typescript
// composables/use-live2d-tracking.ts
import { onMounted, onUnmounted } from 'vue'
import type { Live2DModel } from 'pixi-live2d-display'

export function useLive2dTracking(model: Ref<Live2DModel | null>) {
  function handleMouseMove(event: MouseEvent) {
    if (!model.value) return

    const { clientX, clientY } = event
    const { innerWidth, innerHeight } = window

    // Normalize to -1 to 1
    const x = (clientX / innerWidth) * 2 - 1
    const y = (clientY / innerHeight) * 2 - 1

    model.value.focus(x * 100, y * 100)
  }

  onMounted(() => {
    window.addEventListener('mousemove', handleMouseMove)
  })

  onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
  })
}
```

## Physics Configuration

```typescript
// composables/use-live2d-physics.ts
import type { Live2DModel } from 'pixi-live2d-display'

export function configurePhysics(model: Live2DModel) {
  // Adjust hair physics
  model.physics?.setHairGravity(0, -1)

  // Adjust breath
  model.internalModel.motionManager.settings.autoAddIdleMotion = true

  // Adjust blink
  model.internalModel.motionManager.settings.autoBlink = true
}
```

## Vue Component Integration

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useLive2d } from '../composables/use-live2d'
import { useLive2dExpression } from '../composables/use-live2d-expression'
import { useLive2dTracking } from '../composables/use-live2d-tracking'

const canvasRef = ref<HTMLCanvasElement>()
const { model, isLoading, init, load } = useLive2d()
const { setEmotion } = useLive2dExpression(model)

useLive2dTracking(model)

// Watch for emotion changes from store
watch(
  () => store.currentEmotion,
  (emotion) => setEmotion(emotion)
)

onMounted(async () => {
  if (canvasRef.value) {
    await init(canvasRef.value)
    await load('/models/character.model3.json')
  }
})
</script>

<template>
  <div :class="['relative']">
    <canvas ref="canvasRef" :class="['w-full h-full']" />
    <div v-if="isLoading" :class="['absolute inset-0 flex items-center justify-center']">
      Loading...
    </div>
  </div>
</template>
```

## Model Caching (OPFS)

```typescript
// utils/model-cache.ts
import { OPFS } from '@lemonneko/crop-empty-pixels'

const cache = new OPFS('live2d-cache')

export async function getCachedModel(url: string): Promise<ArrayBuffer | null> {
  const key = new URL(url).pathname
  return await cache.get(key)
}

export async function cacheModel(url: string, data: ArrayBuffer): Promise<void> {
  const key = new URL(url).pathname
  await cache.set(key, data)
}
```

## Best Practices

1. **Use transparent canvas** for overlay effects
2. **Enable auto-blink** for natural appearance
3. **Implement mouse tracking** for interactivity
4. **Cache models** in OPFS for faster loading
5. **Dispose resources** on component unmount
6. **Use expression mapping** for emotion system

## Checklist

- [ ] Initialize PIXI.Application with transparent background
- [ ] Load model with `Live2DModel.from()`
- [ ] Set up eye/mouse tracking
- [ ] Configure physics and auto-blink
- [ ] Map emotions to expressions
- [ ] Cache models in OPFS
- [ ] Dispose on unmount
