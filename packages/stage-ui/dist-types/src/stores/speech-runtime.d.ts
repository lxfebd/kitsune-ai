export declare const useSpeechRuntimeStore: import("pinia").StoreDefinition<"speech-runtime", Pick<{
    openIntent: (options?: Parameters<(options?: import("@kitsune/pipelines-audio").IntentOptions) => import("@kitsune/pipelines-audio").IntentHandle>[0]) => import("@kitsune/pipelines-audio").IntentHandle;
    registerHost: (pipeline: Parameters<(pipeline: ReturnType<typeof import("@kitsune/pipelines-audio").createSpeechPipeline>) => Promise<void>>[0]) => Promise<void>;
    isHost: () => boolean;
    dispose: () => Promise<void>;
}, never>, Pick<{
    openIntent: (options?: Parameters<(options?: import("@kitsune/pipelines-audio").IntentOptions) => import("@kitsune/pipelines-audio").IntentHandle>[0]) => import("@kitsune/pipelines-audio").IntentHandle;
    registerHost: (pipeline: Parameters<(pipeline: ReturnType<typeof import("@kitsune/pipelines-audio").createSpeechPipeline>) => Promise<void>>[0]) => Promise<void>;
    isHost: () => boolean;
    dispose: () => Promise<void>;
}, never>, Pick<{
    openIntent: (options?: Parameters<(options?: import("@kitsune/pipelines-audio").IntentOptions) => import("@kitsune/pipelines-audio").IntentHandle>[0]) => import("@kitsune/pipelines-audio").IntentHandle;
    registerHost: (pipeline: Parameters<(pipeline: ReturnType<typeof import("@kitsune/pipelines-audio").createSpeechPipeline>) => Promise<void>>[0]) => Promise<void>;
    isHost: () => boolean;
    dispose: () => Promise<void>;
}, "dispose" | "openIntent" | "registerHost" | "isHost">>;
