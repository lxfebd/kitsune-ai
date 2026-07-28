import type { BaseVAD, BaseVADConfig, VADEventCallback, VADEvents } from '../../libs/audio/vad';
/**
 * Voice Activity Detection processor
 */
export declare class VAD implements BaseVAD {
    private config;
    private model;
    private state;
    private sampleRateTensor;
    private buffer;
    private bufferPointer;
    private isRecording;
    private postSpeechSamples;
    private prevBuffers;
    private inferenceChain;
    private eventListeners;
    private isReady;
    constructor(userConfig?: Partial<BaseVADConfig>);
    /**
     * Initialize the VAD model
     */
    initialize(): Promise<void>;
    /**
     * Add event listener
     */
    on<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void;
    /**
     * Remove event listener
     */
    off<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void;
    /**
     * Emit event
     */
    private emit;
    /**
     * Process audio buffer for speech detection
     */
    processAudio(inputBuffer: Float32Array): Promise<void>;
    /**
     * Detect speech in an audio buffer
     */
    private detectSpeech;
    /**
     * Process a complete speech segment
     */
    private processSpeechSegment;
    /**
     * Reset the VAD state
     */
    private reset;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<BaseVADConfig>): void;
}
/**
 * Create a VAD processor with the given configuration
 */
export declare function createVAD(config?: Partial<BaseVADConfig>): Promise<VAD>;
