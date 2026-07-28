import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils';
import type { StreamTranscriptionResult } from '@xsai/stream-transcription';
export interface WebSpeechAPIExtraOptions {
    language?: string;
    continuous?: boolean;
    interimResults?: boolean;
    maxAlternatives?: number;
    abortSignal?: AbortSignal;
}
/**
 * Web Speech API Speech Recognition provider
 *
 * This is a free, browser-native STT solution that requires no API keys.
 * Available in Chrome, Edge, Safari, and other Chromium-based browsers.
 *
 * Limitations:
 * - Only works in browser contexts (Electron renderer, web browsers)
 * - Requires user permission for microphone access
 * - Language support depends on browser implementation
 * - Not available in Node.js or Tauri main process
 */
export declare function createWebSpeechAPIProvider(): TranscriptionProviderWithExtraOptions<string, WebSpeechAPIExtraOptions>;
/**
 * Stream transcription using Web Speech API with MediaStream
 * This is designed to work with the existing hearing pipeline
 */
export declare function streamWebSpeechAPITranscription(_mediaStream: MediaStream, options?: WebSpeechAPIExtraOptions & {
    onSentenceEnd?: (delta: string) => void;
    onSpeechEnd?: (text: string) => void;
}): StreamTranscriptionResult & {
    recognition?: any;
};
