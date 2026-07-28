import type { EmotionPayload } from '../../constants/emotions';
/**
 * 桌宠情绪事件队列 store — 跨组件可访问的 emotionsQueue。
 *
 * Stage.vue 从此 store 读取待播放的情绪，其他组件（如 executor 事件桥接器）
 * 通过 enqueue 推入情绪。替代 Stage.vue 内部的局部队列，使主进程事件能驱动桌宠表情。
 */
export declare const usePetEmotionStore: import("pinia").StoreDefinition<"pet-emotion", Pick<{
    queue: import("vue").Ref<{
        name: import("../../constants").Emotion;
        intensity: number;
    }[], EmotionPayload[] | {
        name: import("../../constants").Emotion;
        intensity: number;
    }[]>;
    enqueue: (emotion: EmotionPayload) => void;
    dequeue: () => EmotionPayload | undefined;
    peek: () => EmotionPayload | undefined;
    clear: () => void;
}, "queue">, Pick<{
    queue: import("vue").Ref<{
        name: import("../../constants").Emotion;
        intensity: number;
    }[], EmotionPayload[] | {
        name: import("../../constants").Emotion;
        intensity: number;
    }[]>;
    enqueue: (emotion: EmotionPayload) => void;
    dequeue: () => EmotionPayload | undefined;
    peek: () => EmotionPayload | undefined;
    clear: () => void;
}, never>, Pick<{
    queue: import("vue").Ref<{
        name: import("../../constants").Emotion;
        intensity: number;
    }[], EmotionPayload[] | {
        name: import("../../constants").Emotion;
        intensity: number;
    }[]>;
    enqueue: (emotion: EmotionPayload) => void;
    dequeue: () => EmotionPayload | undefined;
    peek: () => EmotionPayload | undefined;
    clear: () => void;
}, "clear" | "enqueue" | "dequeue" | "peek">>;
