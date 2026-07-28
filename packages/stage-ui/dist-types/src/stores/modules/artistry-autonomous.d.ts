import type { Message } from '@xsai/shared-chat';
export declare const useAutonomousArtistryStore: import("pinia").StoreDefinition<"artistry-autonomous", Pick<{
    isProcessing: import("vue").Ref<boolean, boolean>;
    runArtistTask: (inputText: string, history?: Message[], targetOverride?: "user" | "assistant") => Promise<void>;
}, "isProcessing">, Pick<{
    isProcessing: import("vue").Ref<boolean, boolean>;
    runArtistTask: (inputText: string, history?: Message[], targetOverride?: "user" | "assistant") => Promise<void>;
}, never>, Pick<{
    isProcessing: import("vue").Ref<boolean, boolean>;
    runArtistTask: (inputText: string, history?: Message[], targetOverride?: "user" | "assistant") => Promise<void>;
}, "runArtistTask">>;
