---
name: three.js-3d
description: >-
  Three.js 3D rendering for Kitsune UI. Use when working with 3D scenes,
  VRM character models, animations, or post-processing in packages/stage-ui-three/.
---

# Three.js 3D Rendering Guide

Guide for 3D rendering with Three.js in the Kitsune project.

## When to Use

- Creating 3D scenes and renderers
- Loading VRM character models
- Implementing animations
- Adding post-processing effects
- Working with `@tresjs/core` Vue integration

## Core Architecture

```
packages/stage-ui-three/
├── src/
│   ├── components/         # Vue 3D components
│   ├── composables/        # Three.js composables
│   ├── loaders/            # Model loaders
│   └── utils/              # 3D utilities
```

## TresJS Integration

```vue
<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
</script>

<template>
  <TresCanvas>
    <TresPerspectiveCamera :position="[0, 2, 5]" />
    <OrbitControls />

    <TresMesh>
      <TresBoxGeometry :args="[1, 1, 1]" />
      <TresMeshStandardMaterial color="orange" />
    </TresMesh>

    <TresDirectionalLight :position="[5, 5, 5]" intensity="1" />
    <TresAmbientLight intensity="0.5" />
  </TresCanvas>
</template>
```

## VRM Character Loading

```typescript
// composables/use-vrm.ts
import { ref, onUnmounted } from 'vue'
import { useLoader } from '@tresjs/core'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

export function useVRM() {
  const vrm = ref(null)
  const isLoading = ref(false)

  async function load(url: string) {
    isLoading.value = true
    try {
      const { load: loadGLTF } = useLoader(GLTFLoader)
      const gltf = await loadGLTF(url)

      // Register VRM plugin
      gltf.parser.register((parser) => new VRMLoaderPlugin(parser))

      vrm.value = gltf.userData.vrm
      VRMUtils.removeUnnecessaryJoints(vrm.value.humanoid)
    } finally {
      isLoading.value = false
    }
  }

  onUnmounted(() => {
    if (vrm.value) {
      VRMUtils.deepDispose(vrm.value.scene)
    }
  })

  return { vrm, isLoading, load }
}
```

## Animation System

```typescript
// composables/use-vrm-animation.ts
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

export function useVRMAnimation(vrm: Ref<VRM>) {
  const mixer = ref<THREE.AnimationMixer | null>(null)
  const clock = new THREE.Clock()

  function play(clip: THREE.AnimationClip) {
    if (!vrm.value) return

    mixer.value = new THREE.AnimationMixer(vrm.value.scene)
    const action = mixer.value.clipAction(clip)
    action.play()
  }

  function update() {
    if (mixer.value) {
      const delta = clock.getDelta()
      mixer.value.update(delta)
    }
  }

  return { play, update }
}
```

## Post-Processing

```typescript
// composables/use-post-processing.ts
import { usePostProcessing } from '@tresjs/post-processing'
import { Bloom, Vignette } from '@tresjs/post-processing'

export function setupPostProcessing() {
  const { pass } = usePostProcessing()

  pass(Bloom, {
    intensity: 1.5,
    threshold: 0.8,
  })

  pass(Vignette, {
    offset: 0.5,
    darkness: 0.5,
  })
}
```

## Camera Controls

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRenderLoop } from '@tresjs/core'

const cameraRef = ref()

useRenderLoop().onLoop(({ delta }) => {
  if (cameraRef.value) {
    // Custom camera movement
    cameraRef.value.position.y += Math.sin(Date.now() * 0.001) * 0.01
  }
})
</script>

<template>
  <TresCanvas>
    <TresPerspectiveCamera ref="cameraRef" :position="[0, 2, 5]" />
    <OrbitControls :enable-damping="true" />
  </TresCanvas>
</template>
```

## Environment and Lighting

```vue
<template>
  <TresCanvas>
    <!-- Environment map -->
    <Environment preset="sunset" :background="true" />

    <!-- Lights -->
    <TresDirectionalLight
      :position="[5, 5, 5]"
      :intensity="1"
      cast-shadow
    />
    <TresAmbientLight :intensity="0.5" />
    <TresPointLight :position="[-3, 3, 0]" :intensity="0.8" />
  </TresCanvas>
</template>
```

## Model Optimization

```typescript
import { VRMUtils } from '@pixiv/three-vrm'

// Remove unnecessary joints
VRMUtils.removeUnnecessaryJoints(vrm.humanoid)

// Combine skeletons
VRMUtils.combineSkeletons(vrm.scene)

// Deep dispose
VRMUtils.deepDispose(vrm.scene)
```

## Best Practices

1. **Use TresJS** for Vue integration instead of raw Three.js
2. **Dispose resources** in `onUnmounted` to prevent memory leaks
3. **Use `useRenderLoop`** for animations instead of manual requestAnimationFrame
4. **Optimize models** with `VRMUtils` before rendering
5. **Use post-processing** for visual effects
6. **Cast shadows** selectively to improve performance

## Checklist

- [ ] Use `TresCanvas` as scene container
- [ ] Dispose VRM/models on unmount
- [ ] Use `useRenderLoop` for animations
- [ ] Optimize with `VRMUtils`
- [ ] Add proper lighting
- [ ] Test on target devices
