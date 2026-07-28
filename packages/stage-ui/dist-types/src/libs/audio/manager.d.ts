export interface AudioManagerType {
    audioContext: AudioContext;
    analyser: AnalyserNode;
    dataBuffer: Float32Array<ArrayBuffer>;
    frameId: number | null;
    onVolumeChange?: (volume: number) => void;
}
export declare function createAudioManager(): AudioManagerType;
export declare function playAudio(manager: AudioManagerType, source: ArrayBuffer | string): Promise<void>;
export declare function startVolumeTracking(manager: AudioManagerType, callback: (volume: number) => void): void;
export declare function stopVolumeTracking(manager: AudioManagerType): void;
export declare function disposeAudioManager(manager: AudioManagerType): void;
