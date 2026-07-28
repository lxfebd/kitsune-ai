import type { StreamOptions } from '@kitsune/core-agent';
import type { ChatProvider } from '@xsai-ext/providers/utils';
import type { Message } from '@xsai/shared-chat';
export type { StreamEvent, StreamOptions } from '@kitsune/core-agent';
export { isContentArrayRelatedError, isToolRelatedError } from '@kitsune/core-agent';
export declare const useLLM: import("pinia").StoreDefinition<"llm", Pick<{
    models: (apiUrl: string, apiKey: string) => Promise<import("@xsai/model").Model[]>;
    stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>;
}, never>, Pick<{
    models: (apiUrl: string, apiKey: string) => Promise<import("@xsai/model").Model[]>;
    stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>;
}, never>, Pick<{
    models: (apiUrl: string, apiKey: string) => Promise<import("@xsai/model").Model[]>;
    stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>;
}, "stream" | "models">>;
