/**
 * sherpa-onnx 类型声明
 *
 * sherpa-onnx npm 包不提供 TypeScript 类型，此处声明必要的接口。
 * 类型基于 sherpa-onnx 实际 API（v1.13.4）。
 */

declare module 'sherpa-onnx' {
  export interface SenseVoiceModelConfig {
    model: string
    language: string
    useInverseTextNormalization?: number
  }

  export interface ParaformerModelConfig {
    model: string
  }

  export interface WhisperModelConfig {
    encoder: string
    decoder: string
    language: string
    task: string
    tailPaddings: number
  }

  export interface ModelConfig {
    senseVoice?: SenseVoiceModelConfig
    paraformer?: ParaformerModelConfig
    whisper?: WhisperModelConfig
    tokens: string
    numThreads?: number
    provider?: 'cpu' | 'cuda'
    debug?: number
  }

  export interface FeatConfig {
    sampleRate?: number
    featureDim?: number
  }

  export interface OfflineRecognizerConfig {
    featConfig?: FeatConfig
    modelConfig: ModelConfig
    lmConfig?: { model: string, scale: number }
    decodingMethod?: 'greedy_search' | 'modified_beam_search'
    maxActivePaths?: number
    enableEndpoint?: number
    rule1MinTrailingSilence?: number
    rule2MinTrailingSilence?: number
    rule3MinUtteranceLength?: number
  }

  export interface OfflineRecognizerResult {
    text: string
    lang?: string
    emotion?: string
    event?: string
    tokens?: string[]
    timestamps?: number[]
    durations?: number[]
  }

  export class OfflineStream {
    acceptWaveform(sampleRate: number, samples: Float32Array): void
    free(): void
  }

  export class OfflineRecognizer {
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>
    createStream(): OfflineStream
    decode(stream: OfflineStream): void
    getResult(stream: OfflineStream): OfflineRecognizerResult
    free(): void
  }

  export function createOfflineRecognizer(config: OfflineRecognizerConfig): OfflineRecognizer
  export function readWave(filename: string): { samples: Float32Array, sampleRate: number }
  export function readWaveFromBinaryData(data: Uint8Array): { samples: Float32Array, sampleRate: number }
}
