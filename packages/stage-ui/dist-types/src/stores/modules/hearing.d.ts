import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils';
import type { WithUnknown } from '@xsai/shared';
import type { StreamTranscriptionResult, StreamTranscriptionOptions as XSAIStreamTranscriptionOptions } from '@xsai/stream-transcription';
import { generateTranscription } from '@xsai/generate-transcription';
export interface StreamTranscriptionFileInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
    file: Blob;
    fileName?: string;
}
export interface StreamTranscriptionStreamInputOptions extends Omit<XSAIStreamTranscriptionOptions, 'file' | 'fileName'> {
    inputAudioStream: ReadableStream<ArrayBuffer>;
}
export type StreamTranscription = (options: WithUnknown<StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions>) => StreamTranscriptionResult;
type GenerateTranscriptionResponse = Awaited<ReturnType<typeof generateTranscription>>;
type HearingTranscriptionGenerateResult = GenerateTranscriptionResponse & {
    mode: 'generate';
};
type HearingTranscriptionStreamResult = StreamTranscriptionResult & {
    mode: 'stream';
};
export type HearingTranscriptionResult = HearingTranscriptionGenerateResult | HearingTranscriptionStreamResult;
type HearingTranscriptionInput = File | {
    file?: File;
    inputAudioStream?: ReadableStream<ArrayBuffer>;
};
interface HearingTranscriptionInvokeOptions {
    providerOptions?: Record<string, unknown>;
}
export declare const CONFIDENCE_THRESHOLD_DISABLED = -3;
export declare function filterTranscriptionByConfidence(segments: Array<{
    text?: string;
    avg_logprob?: number;
}>, threshold: number): string;
export declare function resolveStreamTranscriptionExecutor(providerId: string): StreamTranscription | undefined;
export declare const useHearingStore: import("pinia").StoreDefinition<"hearing-store", Pick<{
    activeTranscriptionProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    activeTranscriptionModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    availableProvidersMetadata: import("vue").ComputedRef<import("..").ProviderMetadata[]>;
    activeCustomModelName: import("@vueuse/shared").ManualResetRefReturn<string>;
    transcriptionModelSearchQuery: import("@vueuse/shared").ManualResetRefReturn<string>;
    autoSendEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    autoSendDelay: import("@vueuse/shared").ManualResetRefReturn<number>;
    confidenceThreshold: import("@vueuse/shared").ManualResetRefReturn<number>;
    verboseJsonNotSupported: import("vue").Ref<boolean, boolean>;
    supportsModelListing: import("vue").ComputedRef<boolean>;
    providerModels: import("vue").ComputedRef<import("..").ModelInfo[]>;
    isLoadingActiveProviderModels: import("vue").ComputedRef<boolean>;
    activeProviderModelError: import("vue").ComputedRef<string | null>;
    configured: import("vue").ComputedRef<boolean>;
    transcription: (providerId: string, provider: TranscriptionProviderWithExtraOptions<string, any>, model: string, input: HearingTranscriptionInput, format?: "json" | "verbose_json", options?: HearingTranscriptionInvokeOptions) => Promise<HearingTranscriptionResult>;
    loadModelsForProvider: (provider: string) => Promise<void>;
    getModelsForProvider: (provider: string) => Promise<import("..").ModelInfo[]>;
    resetState: () => void;
}, "activeTranscriptionProvider" | "activeTranscriptionModel" | "activeCustomModelName" | "transcriptionModelSearchQuery" | "autoSendEnabled" | "autoSendDelay" | "confidenceThreshold" | "verboseJsonNotSupported">, Pick<{
    activeTranscriptionProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    activeTranscriptionModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    availableProvidersMetadata: import("vue").ComputedRef<import("..").ProviderMetadata[]>;
    activeCustomModelName: import("@vueuse/shared").ManualResetRefReturn<string>;
    transcriptionModelSearchQuery: import("@vueuse/shared").ManualResetRefReturn<string>;
    autoSendEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    autoSendDelay: import("@vueuse/shared").ManualResetRefReturn<number>;
    confidenceThreshold: import("@vueuse/shared").ManualResetRefReturn<number>;
    verboseJsonNotSupported: import("vue").Ref<boolean, boolean>;
    supportsModelListing: import("vue").ComputedRef<boolean>;
    providerModels: import("vue").ComputedRef<import("..").ModelInfo[]>;
    isLoadingActiveProviderModels: import("vue").ComputedRef<boolean>;
    activeProviderModelError: import("vue").ComputedRef<string | null>;
    configured: import("vue").ComputedRef<boolean>;
    transcription: (providerId: string, provider: TranscriptionProviderWithExtraOptions<string, any>, model: string, input: HearingTranscriptionInput, format?: "json" | "verbose_json", options?: HearingTranscriptionInvokeOptions) => Promise<HearingTranscriptionResult>;
    loadModelsForProvider: (provider: string) => Promise<void>;
    getModelsForProvider: (provider: string) => Promise<import("..").ModelInfo[]>;
    resetState: () => void;
}, "configured" | "availableProvidersMetadata" | "supportsModelListing" | "providerModels" | "isLoadingActiveProviderModels" | "activeProviderModelError">, Pick<{
    activeTranscriptionProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    activeTranscriptionModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    availableProvidersMetadata: import("vue").ComputedRef<import("..").ProviderMetadata[]>;
    activeCustomModelName: import("@vueuse/shared").ManualResetRefReturn<string>;
    transcriptionModelSearchQuery: import("@vueuse/shared").ManualResetRefReturn<string>;
    autoSendEnabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    autoSendDelay: import("@vueuse/shared").ManualResetRefReturn<number>;
    confidenceThreshold: import("@vueuse/shared").ManualResetRefReturn<number>;
    verboseJsonNotSupported: import("vue").Ref<boolean, boolean>;
    supportsModelListing: import("vue").ComputedRef<boolean>;
    providerModels: import("vue").ComputedRef<import("..").ModelInfo[]>;
    isLoadingActiveProviderModels: import("vue").ComputedRef<boolean>;
    activeProviderModelError: import("vue").ComputedRef<string | null>;
    configured: import("vue").ComputedRef<boolean>;
    transcription: (providerId: string, provider: TranscriptionProviderWithExtraOptions<string, any>, model: string, input: HearingTranscriptionInput, format?: "json" | "verbose_json", options?: HearingTranscriptionInvokeOptions) => Promise<HearingTranscriptionResult>;
    loadModelsForProvider: (provider: string) => Promise<void>;
    getModelsForProvider: (provider: string) => Promise<import("..").ModelInfo[]>;
    resetState: () => void;
}, "resetState" | "transcription" | "getModelsForProvider" | "loadModelsForProvider">>;
export declare const useHearingSpeechInputPipeline: import("pinia").StoreDefinition<"modules:hearing:speech:audio-input-pipeline", Pick<{
    error: import("vue").Ref<string | undefined, string | undefined>;
    transcribeForRecording: (recording: Blob | null | undefined) => Promise<string | undefined>;
    transcribeForMediaStream: (stream: MediaStream, options?: {
        sampleRate?: number;
        providerOptions?: Record<string, unknown>;
        idleTimeoutMs?: number;
        onSentenceEnd?: (delta: string) => void;
        onSpeechEnd?: (text: string) => void;
    }) => Promise<void>;
    stopStreamingTranscription: (abort?: boolean, disposeProviderId?: string) => Promise<string | undefined>;
    supportsStreamInput: import("vue").ComputedRef<boolean>;
}, "error">, Pick<{
    error: import("vue").Ref<string | undefined, string | undefined>;
    transcribeForRecording: (recording: Blob | null | undefined) => Promise<string | undefined>;
    transcribeForMediaStream: (stream: MediaStream, options?: {
        sampleRate?: number;
        providerOptions?: Record<string, unknown>;
        idleTimeoutMs?: number;
        onSentenceEnd?: (delta: string) => void;
        onSpeechEnd?: (text: string) => void;
    }) => Promise<void>;
    stopStreamingTranscription: (abort?: boolean, disposeProviderId?: string) => Promise<string | undefined>;
    supportsStreamInput: import("vue").ComputedRef<boolean>;
}, "supportsStreamInput">, Pick<{
    error: import("vue").Ref<string | undefined, string | undefined>;
    transcribeForRecording: (recording: Blob | null | undefined) => Promise<string | undefined>;
    transcribeForMediaStream: (stream: MediaStream, options?: {
        sampleRate?: number;
        providerOptions?: Record<string, unknown>;
        idleTimeoutMs?: number;
        onSentenceEnd?: (delta: string) => void;
        onSpeechEnd?: (text: string) => void;
    }) => Promise<void>;
    stopStreamingTranscription: (abort?: boolean, disposeProviderId?: string) => Promise<string | undefined>;
    supportsStreamInput: import("vue").ComputedRef<boolean>;
}, "transcribeForRecording" | "transcribeForMediaStream" | "stopStreamingTranscription">>;

