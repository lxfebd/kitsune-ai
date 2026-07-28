import type { Tool } from '@xsai/shared-chat';
type ToolRegistration = Promise<Tool[]> | Tool[];
/**
 * Stores runtime-registered xsai tools keyed by provider.
 *
 * Use when:
 * - App runtimes need to publish additional LLM tools into shared stage-ui logic
 *
 * Expects:
 * - Provider names are stable identifiers such as `mcp` or `plugin-tools`
 *
 * Returns:
 * - A merged reactive list of all currently registered tools
 */
export declare const useLlmToolsStore: import("pinia").StoreDefinition<"llm-tools", Pick<{
    activeTools: import("vue").ComputedRef<Tool[]>;
    awaitPendingRegistrations: () => Promise<void>;
    clearTools: (provider: string) => void;
    registerTools: (provider: string, tools: ToolRegistration) => Promise<Tool[]>;
    toolsByProvider: import("vue").Ref<Record<string, Tool[]>, Record<string, Tool[]>>;
}, "toolsByProvider">, Pick<{
    activeTools: import("vue").ComputedRef<Tool[]>;
    awaitPendingRegistrations: () => Promise<void>;
    clearTools: (provider: string) => void;
    registerTools: (provider: string, tools: ToolRegistration) => Promise<Tool[]>;
    toolsByProvider: import("vue").Ref<Record<string, Tool[]>, Record<string, Tool[]>>;
}, "activeTools">, Pick<{
    activeTools: import("vue").ComputedRef<Tool[]>;
    awaitPendingRegistrations: () => Promise<void>;
    clearTools: (provider: string) => void;
    registerTools: (provider: string, tools: ToolRegistration) => Promise<Tool[]>;
    toolsByProvider: import("vue").Ref<Record<string, Tool[]>, Record<string, Tool[]>>;
}, "awaitPendingRegistrations" | "clearTools" | "registerTools">>;

