<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@kitsune/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

import workletUrl from '@kitsune/stage-ui/workers/vad/process.worklet?worker&url'

import { tryCatch } from '@moeru/std'
import { electron } from '@kitsune/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@kitsune/electron-vueuse'
import { IS_DEV } from '@kitsune/stage-shared'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@kitsune/stage-ui-three'
import { HoloCoupon } from '@kitsune/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@kitsune/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@kitsune/stage-ui/components/scenes'
import VisionCheckBridge from './settings/environment/components/VisionCheckBridge.vue'
import { useAudioRecorder } from '@kitsune/stage-ui/composables/audio/audio-recorder'
import { useCanvasPixelIsTransparentAtPoint } from '@kitsune/stage-ui/composables/canvas-alpha'
import { useVAD } from '@kitsune/stage-ui/stores/ai/models/vad'
import { useHearingSpeechInputPipeline } from '@kitsune/stage-ui/stores/modules/hearing'
import { useOnboardingStore } from '@kitsune/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@kitsune/stage-ui/stores/settings'
import { refDebounced, until, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'
import StatusIsland from '../components/stage-islands/status-island/index.vue'

import { electronOpenOnboarding } from '../../shared/eventa'
import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'
import { useChatSyncStore } from '../stores/chat-sync'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const statusIslandRef = ref<InstanceType<typeof StatusIsland>>()
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')
const stageMounted = computed(() => componentStateStage.value === 'mounted')
const isLoading = computed(() => !stageMounted.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside } = useElectronMouseInElement(controlsIslandRef)
const { isOutside: isOutsideStatusIsland } = useElectronMouseInElement(statusIslandRef)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
const isOutsideStatusIslandFor250Ms = refDebounced(isOutsideStatusIsland, 250)
const { x: relativeMouseX, y: relativeMouseY } = useElectronRelativeMouse()
// NOTICE: In real-world use cases of Fade on Hover feature, the cursor may move around the edge of the
// model rapidly, causing flickering effects when checking pixel transparency strictly.
// Here we use render-target pixel sampling to keep detection aligned with the actual render output.
const isTransparentByPixels = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)
const isTransparentByThree = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)
const modelStore = useModelStore()
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)
const { stagePaused } = storeToRefs(useStageWindowLifecycleStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const modelSettingsRuntimeOwnerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
const { data: modelSettingsRuntimeChannelEvent, post: postModelSettingsRuntimeChannelEvent } = useBroadcastChannel<ModelSettingsRuntimeChannelEvent, ModelSettingsRuntimeChannelEvent>({ name: modelSettingsRuntimeSnapshotChannelName })
const shouldUseThreeTransparencyHitTest = computed(() => shouldSampleStageTransparency({
  componentState: componentStateStage.value,
  fadeOnHoverEnabled: fadeOnHoverEnabled.value,
  stageModelRenderer: stageModelRenderer.value,
  stagePaused: stagePaused.value,
}))
const isTransparent = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThree.value : true

  if (stageModelRenderer.value === 'live2d')
    return isTransparentByPixels.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 10 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const { pause, resume } = watch(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = fadeOnHoverEnabled.value && !transparent
}, { immediate: true })

const hearingDialogOpen = computed(() => controlsIslandRef.value?.hearingDialogOpen ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'vrm') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'vrm',
      phase: hasModel ? scenePhase.value : 'no-model',
      controlsLocked: hasModel
        ? (!stageMounted.value || sceneMutationLocked.value)
        : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'spine') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'spine',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'godot') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'godot',
      phase: hasModel ? 'mounted' : 'no-model',
      controlsLocked: false,
      previewAvailable: false,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
    updatedAt: Date.now(),
  })
})

watch([isOutsideFor250Ms, isOutsideStatusIslandFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, hearingDialogOpen, fadeOnHoverEnabled, stagePaused], () => {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  if (hearingDialogOpen.value) {
    // Hearing dialog/drawer is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  const insideControls = !isOutsideFor250Ms.value || !isOutsideStatusIslandFor250Ms.value
  const nearBorder = isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
  }
  else {
    const fadeEnabled = fadeOnHoverEnabled.value
    // Otherwise allow click-through while we fade UI based on transparency (when enabled)
    isIgnoringMouseEvents.value = fadeEnabled
    shouldFadeOnCursorWithin.value = fadeEnabled && !isOutsideWindow.value && !isTransparent.value
    setIgnoreMouseEvents([fadeEnabled, { forward: true }])
    if (fadeEnabled)
      resume()
    else
      pause()
  }
})

// Emit runtime snapshot on change and on request from settings panel
watch(modelSettingsRuntimeSnapshot, (snapshot) => {
  postModelSettingsRuntimeChannelEvent({ type: 'snapshot', snapshot })
}, { immediate: true })

watch(modelSettingsRuntimeChannelEvent, (event) => {
  if (event?.type !== 'request-current')
    return

  postModelSettingsRuntimeChannelEvent({ type: 'snapshot', snapshot: modelSettingsRuntimeSnapshot.value })
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { askPermission } = settingsAudioDeviceStore
const { onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const chatSyncStore = useChatSyncStore()

const { init: initVAD, dispose: disposeVAD, start: startVAD, loaded: vadLoaded } = useVAD(workletUrl, {
  threshold: ref(0.5),
  onSpeechStart: () => {
    void handleSpeechStart()
  },
  onSpeechEnd: () => {
    void handleSpeechEnd()
  },
})

let stopOnStopRecord: (() => void) | undefined
const audioInteractionStarting = ref(false)

// Caption overlay broadcast channel
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'kitsune-caption-overlay' })

function handleStreamingSentenceEnd(delta: string) {
  console.info('[Main Page] Received transcription delta:', delta)
  const finalText = delta
  if (!finalText || !finalText.trim()) {
    return
  }

  postCaption({ type: 'caption-speaker', text: finalText })

  void (async () => {
    try {
      console.info('[Main Page] Sending transcription to chat:', finalText)
      await chatSyncStore.requestIngest({ text: finalText })
    }
    catch (err) {
      console.error('[Main Page] Failed to send chat from voice:', err)
    }
  })()
}

function handleStreamingSpeechEnd(text: string) {
  console.info('[Main Page] Speech ended, final text:', text)
  postCaption({ type: 'caption-speaker', text })
}

async function handleSpeechStart() {
  // transcribeForMediaStream（含 VAD 降级）内部处理音频和分段转写，
  // 外部 VAD 仅用于宠物动画反馈，不再触发录音，避免双重转写。
  console.info('[Main Page] Speech detected (VAD callback)')
}

async function handleSpeechEnd() {
  // transcribeForMediaStream 内部处理静音检测和句尾转写，
  // 外部 VAD 仅用于宠物动画反馈，不再触发转录，避免双重转写。
  console.info('[Main Page] Speech ended (VAD callback)')
}

async function startAudioInteraction() {
  if (audioInteractionStarting.value)
    return

  // NOTICE: `stopOnStopRecord` only tracks whether the non-stream recording hook was registered.
  //
  // It does NOT guarantee that the current realtime transcription session is still attached to the
  // latest `MediaStream`. We previously used it as a generic "already started" guard, which broke
  // the hearing-config retoggle path: the mic stream was recreated, VAD restarted on the new stream,
  // but `transcribeForMediaStream()` never reattached so speech was detected without any transcript.
  //
  // Keep the startup guard scoped to "startup in progress" only, and let stream changes restart the
  // transcription binding when a new stream arrives.
  audioInteractionStarting.value = true
  try {
    console.info('[Main Page] Starting audio interaction...')

    initVAD().then(() => {
      if (stream.value) {
        console.info('[Main Page] VAD initialized successfully, starting with stream input')
        return startVAD(stream.value)
      }
    }).catch((err) => {
      console.warn('[Main Page] VAD initialization failed (non-critical for Web Speech API):', err)
    })

    // 等待 stream 就绪（audioInputEnabled 的 watcher 异步调用 startStream）
    if (!stream.value) {
      try {
        await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
      }
      catch {
        console.warn('[Main Page] Timed out waiting for audio stream')
        return
      }
    }
    if (stream.value) {
      console.info('[Main Page] Starting transcription...', {
        hasStream: !!stream.value,
      })

      // transcribeForMediaStream 内部处理：
      // - 支持流式的 provider（aliyun-nls / web-speech-api）走实时流
      // - 不支持流式的 provider（sherpa-asr / app-local-whisper）走 VAD 分段批处理降级
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: handleStreamingSentenceEnd,
        onSpeechEnd: handleStreamingSpeechEnd,
      })

      console.info('[Main Page] Transcription started successfully')
    }
    else {
      console.warn('[Main Page] Stream not available, cannot start transcription')
    }

    // NOTICE: This hook is only for record-then-transcribe providers.
    //
    // Streaming providers use the active `MediaStream` directly, so this callback must not be treated
    // as proof that a realtime session is alive. Future refactors should keep recorder-hook bookkeeping
    // separate from stream transcription state, otherwise mic/device re-toggles can leave VAD active
    // but transcription detached.
    //
    // Hook once for non-streaming providers.
    if (!stopOnStopRecord) {
      stopOnStopRecord = onStopRecord(async (recording) => {
        // transcribeForMediaStream（含 VAD 降级）内部处理分段转写，
        // 此回调仅作为 push-to-talk 回退路径保留，正常情况下不会触发
        // （handleSpeechStart 是 no-op，startRecord 不会被调用）。
        if (!recording)
          return

        const text = await transcribeForRecording(recording)
        if (!text || !text.trim())
          return

        // Update caption overlay speaker text via BroadcastChannel
        postCaption({ type: 'caption-speaker', text })

        try {
          await chatSyncStore.requestIngest({ text })
        }
        catch (err) {
          console.error('Failed to send chat from voice:', err)
        }
      })
    }
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
  finally {
    audioInteractionStarting.value = false
  }
}

function stopAudioInteraction() {
  tryCatch(() => {
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    audioInteractionStarting.value = false
    void stopStreamingTranscription(true)
    disposeVAD()
  })
}

watch(enabled, async (val) => {
  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  if (val) {
    await askPermission()
    await startAudioInteraction()
  }
  else {
    stopAudioInteraction()
  }
}, { immediate: true })

onMounted(() => {
  if (onboardingStore.needsOnboarding) {
    openOnboarding()
  }
})

onUnmounted(() => {
  postModelSettingsRuntimeChannelEvent({
    type: 'owner-gone',
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  })
  stopAudioInteraction()
})

watch(stream, async (currentStream) => {
  if (!enabled.value || !currentStream || audioInteractionStarting.value)
    return

  // NOTICE: The controls-island mic toggle and device changes can replace the underlying MediaStream
  // without reloading the page. When that happens, VAD may successfully restart against the new stream,
  // but any existing transcription transport is still bound to the old one. Always allow the page to
  // re-run `startAudioInteraction()` for a newly available stream unless startup is already underway.
  console.info('[Main Page] Stream became available, ensuring audio interaction is started')
  await startAudioInteraction()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
  }
})

// Assistant caption is broadcast from Stage.vue via the same channel

const cursorPosition = computed(() => ({
  x: relativeMouseX.value,
  y: relativeMouseY.value,
}))
</script>

<template>
  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <!-- Stage is always in DOM so TresCanvas can measure dimensions -->
    <div
      :class="[
        'relative h-full w-full items-end gap-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'absolute',
          'top-0 left-0 w-full h-full',
          'overflow-hidden',
          'rounded-2xl',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <StatusIsland v-if="IS_DEV" ref="statusIslandRef" />
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :cursor-position="cursorPosition"
          :paused="stagePaused"
        />
        <HoloCoupon />
        <ControlsIsland
          ref="controlsIslandRef"
        />
      </div>
    </div>
    <!-- Loading overlay sits on top, does not hide the stage -->
    <div v-show="isLoading" class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
      <div
        :class="[
          'absolute h-24 w-full overflow-hidden rounded-xl',
          'flex items-center justify-center',
          'bg-white/80 dark:bg-neutral-950/80',
          'backdrop-blur-md',
        ]"
      >
        <div
          :class="[
            'drag-region',
            'absolute left-0 top-0',
            'h-full w-full flex items-center justify-center',
            'text-1.5rem text-primary-600 dark:text-primary-400 font-normal',
            'select-none',
            'animate-flash animate-duration-5s animate-count-infinite',
          ]"
        >
          Loading...
        </div>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="false"
      class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden drag-region"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div v-if="isAroundWindowBorderFor250Ms && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>
  <!-- 后台：视觉校验桥接（无 UI），始终挂载以保证 overseer 视觉校验可达 -->
  <VisionCheckBridge />
</template>

<style scoped>
@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
