<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef } from 'vue'

const props = withDefaults(defineProps<{
  baseSpeed?: number
  friction?: number
  momentumFactor?: number
}>(), {
  baseSpeed: 0.1,
  friction: 0.95,
  momentumFactor: 0.005,
})

const momentum = ref(1) // Base momentum
const currentValue = ref(0)
let lastTimestamp = 0
const rafId = ref<number | null>(null)

// Physics parameters with defaults
const FRICTION = toRef(() => props.friction)
const BASE_SPEED = toRef(() => props.baseSpeed)
const MOMENTUM_FACTOR = toRef(() => props.momentumFactor)

function updateMomentum(timestamp: number) {
  if (!lastTimestamp)
    lastTimestamp = timestamp
  const deltaTime = timestamp - lastTimestamp
  lastTimestamp = timestamp

  // Apply friction to gradually return to base speed
  momentum.value = BASE_SPEED.value + (momentum.value - BASE_SPEED.value) * FRICTION.value

  // Update value based on current momentum
  currentValue.value += momentum.value * deltaTime

  rafId.value = requestAnimationFrame(updateMomentum)
}

function handleMouseMove(event: MouseEvent) {
  // Calculate movement speed
  const speed = Math.sqrt(
    event.movementX ** 2
    + event.movementY ** 2,
  )

  // Add to current momentum
  momentum.value += speed * MOMENTUM_FACTOR.value
}

// 页面隐藏时暂停 RAF，可见时恢复，避免后台持续消耗 CPU
function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (rafId.value !== null) {
      cancelAnimationFrame(rafId.value)
      rafId.value = null
      // 重置时间戳，避免恢复后 deltaTime 过大造成跳变
      lastTimestamp = 0
    }
  }
  else if (document.visibilityState === 'visible') {
    if (rafId.value === null)
      rafId.value = requestAnimationFrame(updateMomentum)
  }
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  rafId.value = requestAnimationFrame(updateMomentum)
})

onUnmounted(() => {
  if (rafId.value !== null) {
    cancelAnimationFrame(rafId.value)
    rafId.value = null
  }
  window.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// Expose values and momentum to parent
defineExpose({
  momentum,
  currentValue,
})
</script>

<template>
  <slot
    :momentum="momentum"
    :current-value="currentValue"
  />
</template>
