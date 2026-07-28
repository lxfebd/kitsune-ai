import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils';
import type { CommonRequestOptions } from '@xsai/shared';
import type { StreamTranscriptionResult } from '@xsai/stream-transcription';
import type { EventStartTranscription, ServerEvent } from './';
import { createAliyunNLSSession } from './';
type SessionOptions = NonNullable<Parameters<typeof createAliyunNLSSession>[3]>;
type AudioChunk = ArrayBuffer | ArrayBufferView;
export interface AliyunRealtimeSpeechExtraOptions {
    region?: SessionOptions['region'];
    abortSignal?: AbortSignal;
    sessionOptions?: EventStartTranscription['payload'];
    inputAudioStream?: ReadableStream<AudioChunk>;
    hooks?: {
        onWebSocketConnecting?: () => Promise<void> | void;
        onWebSocketOpen?: () => Promise<void> | void;
        onWebSocketClose?: (code: number, reason: string) => Promise<void> | void;
        onWebSocketError?: (event: Event) => Promise<void> | void;
        onServerEvent?: (event: ServerEvent) => Promise<void> | void;
    };
    onSessionTerminated?: (error?: unknown) => Promise<void> | void;
}
export interface CreateAliyunStreamTranscriptionOptions extends AliyunRealtimeSpeechExtraOptions {
    accessKeyId: string;
    accessKeySecret: string;
    appKey: string;
    audioStream: ReadableStream<AudioChunk>;
}
export interface AliyunStreamTranscriptionHandle {
    close: () => Promise<void>;
}
interface AliyunStreamTranscriptionOptions extends AliyunRealtimeSpeechExtraOptions {
    baseURL?: CommonRequestOptions['baseURL'];
    fetch?: CommonRequestOptions['fetch'];
    headers?: HeadersInit;
    file?: Blob;
    fileName?: string;
    inputStream?: ReadableStream<AudioChunk>;
}
export declare function streamAliyunTranscription(options: AliyunStreamTranscriptionOptions): StreamTranscriptionResult;
export declare function createAliyunNLSProvider(accessKeyId: string, accessKeySecret: string, appKey: string, options?: {
    region?: SessionOptions['region'];
}): SpeechProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions> & {
    dispose: () => Promise<void>;
};

