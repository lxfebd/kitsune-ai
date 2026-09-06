/** ASR 适配器接口 */
export interface ASRAdapter {
  /** 适配器名称 */
  name: string
  /** 转录音频数据为文本 */
  transcribe(audio: ArrayBuffer, options?: ASROptions): Promise<TranscriptionResult>
  /** 流式转录（如果支持） */
  transcribeStream?(stream: ReadableStream<ArrayBuffer>, options?: ASROptions): ReadableStream<TranscriptionChunk>
}

/** ASR 选项 */
export interface ASROptions {
  /** 语言代码 */
  language?: string
  /** 采样率 */
  sampleRate?: number
  /** 音频格式 */
  format?: 'pcm' | 'wav' | 'mp3' | 'ogg'
}

/** 转录结果 */
export interface TranscriptionResult {
  /** 转录文本 */
  text: string
  /** 置信度 (0-1) */
  confidence?: number
  /** 分段信息 */
  segments?: TranscriptionSegment[]
  /** 语言检测结果 */
  language?: string
}

/** 转录分段 */
export interface TranscriptionSegment {
  /** 文本 */
  text: string
  /** 开始时间 (秒) */
  start: number
  /** 结束时间 (秒) */
  end: number
  /** 置信度 */
  confidence?: number
}

/** 流式转录块 */
export interface TranscriptionChunk {
  /** 文本片段 */
  text: string
  /** 是否最终结果 */
  isFinal: boolean
  /** 时间戳 */
  timestamp?: number
}

/** 转录流水线配置 */
export interface TranscribePipelineConfig {
  /** ASR 适配器 */
  adapter: ASRAdapter
  /** 默认语言 */
  defaultLanguage?: string
}

/**
 * 转录流水线
 *
 * 将音频输入连接到 ASR 适配器，提供统一的转录接口。
 *
 * Use when: 需要将音频文件流转录为文本。
 * Expects: ASR 适配器实例。
 * Returns: TranscribePipeline 实例。
 */
export interface TranscribePipeline {
  /** 转录音频文件 */
  transcribeFile(file: File, options?: ASROptions): Promise<TranscriptionResult>
  /** 转录音频数据 */
  transcribeBuffer(buffer: ArrayBuffer, options?: ASROptions): Promise<TranscriptionResult>
  /** 流式转录（如果适配器支持） */
  transcribeStream?(stream: ReadableStream<ArrayBuffer>, options?: ASROptions): ReadableStream<TranscriptionChunk>
}

export function createTranscribePipeline(config: TranscribePipelineConfig): TranscribePipeline {
  const { adapter, defaultLanguage } = config

  async function transcribeFile(file: File, options?: ASROptions): Promise<TranscriptionResult> {
    const buffer = await file.arrayBuffer()
    return adapter.transcribe(buffer, {
      language: options?.language ?? defaultLanguage,
      format: guessFormat(file.name),
      ...options,
    })
  }

  async function transcribeBuffer(buffer: ArrayBuffer, options?: ASROptions): Promise<TranscriptionResult> {
    return adapter.transcribe(buffer, {
      language: options?.language ?? defaultLanguage,
      ...options,
    })
  }

  const pipeline: TranscribePipeline = {
    transcribeFile,
    transcribeBuffer,
  }

  if (adapter.transcribeStream) {
    pipeline.transcribeStream = (stream, options) => adapter.transcribeStream!(stream, {
      language: options?.language ?? defaultLanguage,
      ...options,
    })
  }

  return pipeline
}

function guessFormat(filename: string): ASROptions['format'] {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'wav') return 'wav'
  if (ext === 'mp3') return 'mp3'
  if (ext === 'ogg') return 'ogg'
  return 'pcm'
}
