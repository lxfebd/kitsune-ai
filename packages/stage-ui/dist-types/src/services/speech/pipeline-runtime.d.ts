import type { createSpeechPipeline, IntentHandle, IntentOptions } from '@kitsune/pipelines-audio';
export interface SpeechPipelineRuntime {
    openIntent: (options?: IntentOptions) => IntentHandle;
    registerHost: (pipeline: ReturnType<typeof createSpeechPipeline<AudioBuffer>>) => Promise<void>;
    isHost: () => boolean;
    dispose: () => Promise<void>;
}
export declare function createSpeechPipelineRuntime(): SpeechPipelineRuntime;
