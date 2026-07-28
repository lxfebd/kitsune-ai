import type { UseQueueReturn } from '@kitsune/stream-kit';
import type { EmotionPayload } from '../constants/emotions';
export declare function useEmotionsMessageQueue(emotionsQueue: UseQueueReturn<EmotionPayload>): {
    enqueue: (payload: string) => void;
    clear: () => void;
    length: () => number;
    on: <E extends keyof import("@kitsune/stream-kit").Events<T>>(eventName: E, listener: import("@kitsune/stream-kit").Events<string>[E][number]) => void;
    onHandlerEvent: (eventName: string, listener: (...params: any[]) => void) => void;
};
export declare function useDelayMessageQueue(): {
    enqueue: (payload: string) => void;
    clear: () => void;
    length: () => number;
    on: <E extends keyof import("@kitsune/stream-kit").Events<T>>(eventName: E, listener: import("@kitsune/stream-kit").Events<string>[E][number]) => void;
    onHandlerEvent: (eventName: string, listener: (...params: any[]) => void) => void;
};
