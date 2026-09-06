/**
 * Decode an audio blob into a 16kHz mono Float32Array suitable for the
 * local Whisper worker.
 *
 * The local ASR pipeline expects raw waveform samples at 16kHz in a single
 * channel. Browsers/Electron expose `decodeAudioData` (Web Audio) to decode
 * arbitrary compressed audio (mp3/wav/ogg/...) into PCM, and we use an
 * `OfflineAudioContext` to resample down to 16kHz mono so the downstream
 * Whisper processor receives a consistent input regardless of the source
 * sample rate.
 */

const TARGET_SAMPLE_RATE = 16_000

/**
 * Decode `blob` into a 16kHz mono Float32Array.
 *
 * Falls back gracefully when `OfflineAudioContext` is unavailable (rare in
 * Chromium-based runtimes) by decoding in place and skipping resampling.
 */
export async function decodeAudioToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioContextCtor
    = globalThis.AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextCtor) {
    throw new Error('Web Audio API is unavailable; cannot decode audio for local transcription.')
  }

  // decodeAudioData (sync overload) is widely supported; keep it simple.
  const decodeCtx = new AudioContextCtor()
  try {
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))

    const numberOfChannels = decoded.numberOfChannels
    const length = decoded.length
    const sampleRate = decoded.sampleRate

    // Mix down to mono first.
    const mono = new Float32Array(length)
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = decoded.getChannelData(ch)
      for (let i = 0; i < length; i++)
        mono[i] += channelData[i] / numberOfChannels
    }

    if (sampleRate === TARGET_SAMPLE_RATE) {
      return mono
    }

    // Resample mono -> 16kHz using an OfflineAudioContext.
    const OfflineCtx = globalThis.OfflineAudioContext
      ?? (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!OfflineCtx) {
      // No high-quality resampler available: fall back to a manual linear
      // interpolation so the Whisper processor still receives 16kHz audio.
      // Returning `mono` at the *original* sample rate here would make Whisper
      // interpret the wrong duration/pitch and produce severely distorted
      // transcripts.
      const ratio = TARGET_SAMPLE_RATE / sampleRate
      const newLength = Math.max(1, Math.ceil(length * ratio))
      const out = new Float32Array(newLength)
      for (let i = 0; i < newLength; i++) {
        const srcPos = i / ratio
        const left = Math.floor(srcPos)
        const right = Math.min(length - 1, left + 1)
        const frac = srcPos - left
        out[i] = mono[left] * (1 - frac) + mono[right] * frac
      }
      return out
    }

    const offline = new OfflineCtx(1, Math.ceil(length * (TARGET_SAMPLE_RATE / sampleRate)), TARGET_SAMPLE_RATE)
    const buffer = offline.createBuffer(1, length, sampleRate)
    buffer.copyToChannel(mono, 0)
    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()

    const resampled = await offline.startRendering()
    return resampled.getChannelData(0).slice()
  }
  finally {
    void decodeCtx.close().catch(() => {})
  }
}
