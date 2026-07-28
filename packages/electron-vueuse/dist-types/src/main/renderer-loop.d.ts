import type { BrowserWindow } from 'electron';
export declare function safeClose(window?: BrowserWindow | null): boolean;
export declare function isRendererUnavailable(window: BrowserWindow): boolean;
export declare function shouldStopForRendererError(error: unknown): boolean;
export declare function stopLoopWhenRendererIsGone(window: BrowserWindow, stop: () => void): void;
export declare function createRendererLoop(params: {
    window: BrowserWindow;
    run: () => Promise<void> | void;
    interval?: number;
    autoStart?: boolean;
}): {
    start: () => void;
    stop: () => void;
};
