---
name: tts-asr-pipeline
description: >-
  TTS (Text-to-Speech) and ASR (Automatic Speech Recognition) pipeline for
  Kitsune. Use when working with voice synthesis, speech recognition, or
  audio processing in packages/kitsune-tts-hybrid/ and packages/pipelines-audio/.
---

# TTS/ASR Pipeline Guide

Guide for text-to-speech and speech recognition in the Kitsune project.

## When to Use

- Implementing TTS voice synthesis
- Adding ASR speech recognition
- Working with audio pipelines
- Integrating voice providers (cloud or local)
- Processing audio streams

## Core Architecture

```
packages/
├── kitsune-tts-hybrid/        # Hybrid TTS (cloud + local)
│   └── src/
│       ├── providers/         # TTS provider implementations
│       ├── engine.ts          # TTS engine manager
│       └── types.ts
├── pipelines-audio/           # Audio processing pipelines
│   └── src/
│       ├── transcribe.ts      # ASR transcription
│       └── process.ts         # Audio processing
└── audio/                     # Audio utilities
```

## TTS with xsai

```typescript
// composables/use-tts.ts
import { ref } from 'vue'
import { generateSpeech } from '@xsai/generate-speech'

export function useTTS() {
  const isSpeaking = ref(false)
  const audioContext = ref<AudioContext | null>(null)

  async function speak(text: string, voice?: string) {
    isSpeaking.value = true

    try {
      const audio = await generateSpeech({
        model: 'tts-1',
        input: text,
        voice: voice || 'alloy',
      })

      // Play audio
      if (!audioContext.value) {
        audioContext.value = new AudioContext()
      }

      const buffer = await audioContext.value.decodeAudioData(audio)
      const source = audioContext.value.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.value.destination)
      source.start()

      source.onended = () => {
        isSpeaking.value = false
      }
    } catch (error) {
      isSpeaking.value = false
      throw error
    }
  }

  return { isSpeaking, speak }
}
```

## TTS Provider Pattern

```typescript
// providers/tts-provider.ts
export interface TTSProvider {
  name: string
  speak(text: string, options?: TTSOptions): Promise<ArrayBuffer>
  getVoices(): Promise<Voice[]>
}

export interface TTSOptions {
  voice?: string
  speed?: number
  pitch?: number
  format?: 'mp3' | 'wav' | 'ogg'
}

export interface Voice {
  id: string
  name: string
  language: string
  gender?: 'male' | 'female' | 'neutral'
}

// Cloud provider implementation
export class OpenAITTSProvider implements TTSProvider {
  name = 'openai'

  async speak(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: options?.voice || 'alloy',
        speed: options?.speed || 1,
      }),
    })

    return response.arrayBuffer()
  }

  async getVoices(): Promise<Voice[]> {
    return [
      { id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral' },
      { id: 'echo', name: 'Echo', language: 'en', gender: 'male' },
      { id: 'fable', name: 'Fable', language: 'en', gender: 'female' },
    ]
  }
}
```

## Local TTS (Electron Sidecar)

```typescript
// services/tts/local-tts.ts
import { spawn } from 'node:child_process'

export class LocalTTSProvider implements TTSProvider {
  name = 'local'
  private process: ChildProcess | null = null

  async speak(text: string, options?: TTSOptions): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'tts-sidecar/start_stdio.py')
      this.process = spawn('python', [script])

      const chunks: Buffer[] = []

      this.process.stdout?.on('data', (data) => {
        chunks.push(Buffer.from(data))
      })

      this.process.on('close', () => {
        resolve(Buffer.concat(chunks).buffer)
      })

      this.process.stdin?.write(JSON.stringify({ text, ...options }))
      this.process.stdin?.end()
    })
  }
}
```

## ASR with xsai

```typescript
// composables/use-asr.ts
import { ref } from 'vue'
import { generateTranscription } from '@xsai/generate-transcription'

export function useASR() {
  const isListening = ref(false)
  const transcript = ref('')

  async function transcribe(audio: Blob): Promise<string> {
    const file = new File([audio], 'recording.webm', { type: 'audio/webm' })

    const result = await generateTranscription({
      model: 'whisper-1',
      file,
      language: 'en',
    })

    transcript.value = result.text
    return result.text
  }

  return { isListening, transcript, transcribe }
}
```

## Audio Recording

```typescript
// composables/use-audio-recorder.ts
import { ref, onUnmounted } from 'vue'

export function useAudioRecorder() {
  const isRecording = ref(false)
  const mediaRecorder = ref<MediaRecorder | null>(null)
  const chunks = ref<Blob[]>([])

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder.value = new MediaRecorder(stream)

    mediaRecorder.value.ondataavailable = (event) => {
      chunks.value.push(event.data)
    }

    mediaRecorder.value.start()
    isRecording.value = true
  }

  function stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!mediaRecorder.value) {
        resolve(new Blob())
        return
      }

      mediaRecorder.value.onstop = () => {
        const blob = new Blob(chunks.value, { type: 'audio/webm' })
        chunks.value = []
        isRecording.value = false
        resolve(blob)
      }

      mediaRecorder.value.stop()
    })
  }

  onUnmounted(() => {
    if (mediaRecorder.value && isRecording.value) {
      mediaRecorder.value.stop()
    }
  })

  return { isRecording, startRecording, stopRecording }
}
```

## Audio Processing Pipeline

```typescript
// pipelines-audio/process.ts
export interface AudioPipelineConfig {
  sampleRate: number
  channels: number
  bufferSize: number
}

export function createAudioPipeline(config: AudioPipelineConfig) {
  const audioContext = new AudioContext({ sampleRate: config.sampleRate })

  async function processAudio(input: ArrayBuffer): Promise<AudioBuffer> {
    return audioContext.decodeAudioData(input)
  }

  async function resample(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
    const offline = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.duration * targetRate,
      targetRate
    )

    const source = offline.createBufferSource()
    source.buffer = buffer
    source.connect(offline.destination)
    source.start()

    return offline.startRendering()
  }

  return { processAudio, resample }
}
```

## Streaming TTS

```typescript
// composables/use-streaming-tts.ts
import { ref } from 'vue'

export function useStreamingTTS() {
  const isPlaying = ref(false)
  const audioQueue = ref<ArrayBuffer[]>([])

  async function addToQueue(text: string) {
    const audio = await generateSpeech({
      model: 'tts-1',
      input: text,
    })

    audioQueue.value.push(audio)

    if (!isPlaying.value) {
      playNext()
    }
  }

  async function playNext() {
    if (audioQueue.value.length === 0) {
      isPlaying.value = false
      return
    }

    isPlaying.value = true
    const audio = audioQueue.value.shift()!

    // Play audio
    const context = new AudioContext()
    const buffer = await context.decodeAudioData(audio)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start()

    source.onended = () => playNext()
  }

  return { isPlaying, addToQueue }
}
```

## Best Practices

1. **Use xsai interfaces** for provider-agnostic code
2. **Implement provider pattern** for multiple TTS/ASR backends
3. **Handle audio context** lifecycle properly
4. **Queue audio chunks** for streaming playback
5. **Resample audio** to match provider requirements
6. **Dispose resources** on component unmount

## Checklist

- [ ] Implement TTS provider interface
- [ ] Support multiple voice options
- [ ] Handle audio playback lifecycle
- [ ] Implement ASR transcription
- [ ] Process audio streams correctly
- [ ] Clean up audio contexts on unmount
