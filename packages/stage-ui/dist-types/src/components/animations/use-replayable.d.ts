export declare function useReplayable(replayFn?: () => void | Promise<void>): {
    registerReplay: (callback: () => void | Promise<void>) => () => void;
    isReplaying: () => boolean;
};
