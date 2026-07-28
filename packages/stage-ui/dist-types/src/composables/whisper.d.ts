import type { ProgressPayload } from '../libs/inference/protocol';
export interface UseWhisperOptions {
    onLoading: (message: string) => void;
    onProgress: (payload: ProgressPayload) => void;
    onReady: () => void;
    onStart: () => void;
    onUpdate: (tps: number) => void;
    onComplete: (output: string) => void;
    onError: (message: string) => void;
}
export declare function useWhisper(url: string, options?: Partial<UseWhisperOptions>): {
    transcribe: (input: {
        audio?: string;
        audioFloat32?: Float32Array;
        language: string;
    }) => void;
    status: import("vue").Ref<"ready" | "loading" | null, "ready" | "loading" | null>;
    loadingMessage: import("vue").Ref<string, string>;
    loadingProgress: import("vue").Ref<{
        phase: import("../libs/inference").ProgressPhase;
        percent: number;
        message?: string | undefined;
        file?: string | undefined;
        loaded?: number | undefined;
        total?: number | undefined;
    }[], ProgressPayload[] | {
        phase: import("../libs/inference").ProgressPhase;
        percent: number;
        message?: string | undefined;
        file?: string | undefined;
        loaded?: number | undefined;
        total?: number | undefined;
    }[]>;
    transcribing: import("vue").Ref<boolean, boolean>;
    tps: import("vue").Ref<number, number>;
    result: import("vue").Ref<string, string>;
    load: () => Promise<void>;
    terminate: () => void;
};
