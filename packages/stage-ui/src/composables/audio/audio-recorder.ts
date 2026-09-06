import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { BufferTarget, MediaStreamAudioTrackSource, Output, QUALITY_MEDIUM, WavOutputFormat } from 'mediabunny'
import { ref, shallowRef, toRef } from 'vue'

function getMediaStreamTrack(stream: MediaStream) {
  const tracks = stream.getAudioTracks()
  if (!tracks.length)
    throw new Error('No audio tracks found in stream')
  return tracks[0]
}

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()

  const mediaOutput = ref<Output>()
  const mediaFormat = ref<string>()

  // NOTICE: `start()` is async (AudioContext / resampler init), but VAD fires
  // `stopRecord` from a separate event with no relation to `startRecord`'s
  // completion. Without gating, a short utterance could `finalize()` an Output
  // that never started — yielding an empty/truncated recording and no transcript,
  // so the pet never "hears" the user. Track start completion and let `stopRecord`
  // await it before finalizing.
  let startDone: Promise<void> | undefined
  let startRequested = false

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
    // Return unsubscribe function to prevent memory leaks
    return () => {
      onStopRecordHooks.value = onStopRecordHooks.value.filter(h => h !== callback)
    }
  }

  async function startRecord() {
    if (startRequested)
      return
    startRequested = true
    startDone = (async () => {
      await until(mediaRef).toBeTruthy()

      const track = await getMediaStreamTrack(mediaRef.value!)
      mediaOutput.value = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })

      const audioSource = new MediaStreamAudioTrackSource(track, { codec: 'pcm-f32', bitrate: QUALITY_MEDIUM })
      audioSource.errorPromise.catch(console.error)
      mediaOutput.value.addAudioTrack(audioSource)

      mediaFormat.value = await mediaOutput.value.getMimeType()
      await mediaOutput.value.start()
    })().catch((err) => {
      console.error('[AudioRecorder] startRecord failed:', err)
      // Reset so a later speech-start can retry cleanly.
      startRequested = false
      mediaOutput.value = undefined
      throw err
    })
    return startDone
  }

  async function stopRecord() {
    // Ensure start() has at least begun before we finalize; otherwise the
    // recording would be empty and no transcription would be produced.
    if (startDone)
      await startDone

    if (!mediaOutput.value) {
      return
    }

    await mediaOutput.value.finalize()
    const bufferTarget = mediaOutput.value.target as BufferTarget | undefined
    const buffer = bufferTarget?.buffer
    const audioBlob = buffer ? new Blob([buffer], { type: mediaFormat.value }) : undefined

    recording.value = audioBlob

    // await hooks and catch errors
    for (const hook of onStopRecordHooks.value) {
      try {
        await hook(audioBlob)
      }
      catch (err) {
        console.error('onStopRecord hook failed:', err)
      }
    }

    mediaOutput.value = undefined
    // Reset the start guard so the next speech segment can begin a fresh
    // recording. (startRecord only bails out while a recording is in flight.)
    startRequested = false
    startDone = undefined

    return audioBlob
  }

  return {
    startRecord,
    stopRecord,
    onStopRecord,

    recording,
  }
}
