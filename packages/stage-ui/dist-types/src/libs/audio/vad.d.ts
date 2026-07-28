export interface BaseVADConfig {
    sampleRate: number;
    speechThreshold: number;
    exitThreshold: number;
    minSilenceDurationMs: number;
    speechPadMs: number;
    minSpeechDurationMs: number;
    maxBufferDuration: number;
    newBufferSize: number;
}
export interface VADEvents {
    'speech-start': void;
    'speech-end': void;
    'speech-ready': {
        buffer: Float32Array;
        duration: number;
    };
    'status': {
        type: string;
        message: string;
    };
    'debug': {
        message: string;
        data?: any;
    };
}
export type VADEventCallback<K extends keyof VADEvents> = (event: VADEvents[K]) => void;
export interface BaseVAD {
    initialize: () => Promise<void>;
    processAudio: (inputBuffer: Float32Array) => Promise<void>;
    on: <K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>) => void;
    off: <K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>) => void;
}
export interface VADAudioOptions {
    /**
     * Audio context options
     */
    audioContextOptions?: AudioContextOptions;
    /**
     * The minimum size of audio chunks to process
     */
    minChunkSize?: number;
    /**
     * VAD configuration options
     */
    vadConfig?: Partial<BaseVADConfig>;
}
export declare function createVADStates(vad: BaseVAD, vadAudioWorkletUrl: string, options?: VADAudioOptions): {
    initialize: () => Promise<void>;
    start: (stream: MediaStream) => Promise<void>;
    stop: () => void;
    dispose: () => void;
};
