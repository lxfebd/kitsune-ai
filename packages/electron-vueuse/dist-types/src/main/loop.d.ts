export interface LoopOptions {
    interval?: number;
    autoStart?: boolean;
}
export declare function useLoop(fn: () => Promise<void> | void, options?: LoopOptions): {
    start: () => void;
    resume: () => void;
    pause: () => void;
    stop: () => void;
};
