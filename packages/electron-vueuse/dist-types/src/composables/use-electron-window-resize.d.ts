import type { ResizeDirection } from '@kitsune/electron-eventa';
export declare function useElectronWindowResize(): {
    handleResizeStart: (e: MouseEvent, direction: ResizeDirection) => Promise<void>;
};
