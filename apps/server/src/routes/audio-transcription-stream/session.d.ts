type AliyunNlsRegion = 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal';
interface AliyunNlsCredentials {
    accessKeyId: string;
    accessKeySecret: string;
    appKey: string;
    region: AliyunNlsRegion;
}
interface AliyunNlsToken {
    token: string;
    expiresAt: number;
}
interface AliyunNlsStartPayload {
    format?: 'pcm' | 'wav' | 'opus' | 'speex' | 'amr' | 'mp3' | 'aac';
    sample_rate?: 8000 | 16000;
    enable_intermediate_result?: boolean;
    enable_punctuation_prediction?: boolean;
    enable_inverse_text_normalization?: boolean;
    enable_words?: boolean;
    max_sentence_silence?: number;
}
interface CreateAliyunNlsStreamResponseOptions {
    audioStream: ReadableStream<Uint8Array>;
    credentials: AliyunNlsCredentials;
    createToken?: (credentials: AliyunNlsCredentials) => Promise<AliyunNlsToken>;
    sessionOptions?: AliyunNlsStartPayload;
    websocketBaseURL?: string;
}
/**
 * Streams client microphone PCM through Aliyun NLS and returns xsai-compatible SSE transcript deltas.
 *
 * Use when:
 * - Kitsune owns the Aliyun NLS credentials server-side.
 * - The browser uploads a realtime audio `ReadableStream` and expects transcript deltas.
 *
 * Expects:
 * - `audioStream` contains 16 kHz PCM chunks by default, matching the Hearing worklet output.
 *
 * Returns:
 * - A `text/event-stream` response consumable by the existing `streamAliyunTranscription` executor.
 */
export declare function createAliyunNlsStreamResponse(options: CreateAliyunNlsStreamResponseOptions): Response;

