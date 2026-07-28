<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  stream?: MediaStream
  bars?: number
  minFreq?: number // Minimum frequency in Hz
  maxFreq?: number // Maximum frequency in Hz
}>(), {
  bars: 32,
  minFreq: 60, // Default human voice lower bound (~85Hz)
  maxFreq: 4000, // Default human voice upper bound (~255Hz)
})

const frequencies = ref<number[]>(Array.from<number>({ length: props.bars }).fill(0))

// 组件作用域资源引用：用于在卸载、流切换或页面隐藏时正确清理
// AudioContext 浏览器上限约 6 个，泄漏后将无法创建新 context
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let source: MediaStreamAudioSourceNode | null = null
// requestAnimationFrame 返回的 id，用于 cancelAnimationFrame
let analyzeRafId: number | null = null
// analyze 函数引用：visibilitychange 恢复时需要重新调度同一函数
let analyzeFn: (() => void) | null = null

onMounted(() => {
  handleAnalyze()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

watch(() => props.stream, handleAnalyze)

onUnmounted(() => {
  cleanupResources()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// 释放当前持有的 AudioContext / RAF / source 连接
// 顺序：先停 RAF，再断 source，最后 close context，避免在已关闭 context 上操作节点
function cleanupResources() {
  if (analyzeRafId !== null) {
    cancelAnimationFrame(analyzeRafId)
    analyzeRafId = null
  }
  if (source) {
    try {
      source.disconnect()
    }
    catch {
      // 节点可能已断开或 context 已关闭，忽略
    }
    source = null
  }
  if (audioContext) {
    try {
      audioContext.close()
    }
    catch {
      // context 可能已关闭，忽略
    }
    audioContext = null
  }
  analyser = null
  analyzeFn = null
}

// 页面隐藏时暂停 RAF 节省 CPU（AudioContext 保持打开以便快速恢复）
// 可见时恢复 RAF 调度
function handleVisibilityChange() {
  if (document.hidden) {
    if (analyzeRafId !== null) {
      cancelAnimationFrame(analyzeRafId)
      analyzeRafId = null
    }
  }
  else if (analyzeFn && analyzeRafId === null) {
    analyzeRafId = requestAnimationFrame(analyzeFn)
  }
}

function handleAnalyze() {
  // 流切换或变为 undefined 时，先释放旧资源避免泄漏
  cleanupResources()

  if (!props.stream) {
    return
  }

  const ctx = new (window.AudioContext || (window as unknown as any).webkitAudioContext)()
  const src = ctx.createMediaStreamSource(props.stream)
  const anl = ctx.createAnalyser()

  anl.fftSize = 2048
  src.connect(anl)

  const bufferLength = anl.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  // Calculate frequency resolution (Hz per bin)
  const sampleRate = ctx.sampleRate
  const frequencyResolution = sampleRate / anl.fftSize

  // Calculate bin indices for min and max frequencies
  const minBin = Math.floor(props.minFreq / frequencyResolution)
  const maxBin = Math.floor(props.maxFreq / frequencyResolution)
  const usableBins = maxBin - minBin

  // Calculate bins per bar based on the filtered frequency range
  const binsPerBar = Math.floor(usableBins / props.bars)

  // 暴露到组件作用域以便 onUnmounted / visibilitychange 清理
  audioContext = ctx
  analyser = anl
  source = src

  const analyze = () => {
    try {
      // 先记录 raf id，便于 cancelAnimationFrame 取消
      analyzeRafId = requestAnimationFrame(analyze)
      anl.getByteFrequencyData(dataArray)

      const bars = Array.from<number>({ length: props.bars }).fill(0)

      for (let i = 0; i < props.bars; i++) {
        let sum = 0
        const startBin = minBin + (i * binsPerBar)

        for (let j = 0; j < binsPerBar; j++) {
          const binIndex = startBin + j
          if (binIndex < maxBin) // Ensure we don't exceed max frequency
            sum += dataArray[binIndex]
        }

        bars[i] = sum / binsPerBar / 255 // Normalize to 0-1
      }

      frequencies.value = bars
    }
    catch (err) {
      console.error(err)
    }
  }

  analyzeFn = analyze
  analyze()
}
</script>

<template>
  <slot :frequencies="frequencies" />
</template>
