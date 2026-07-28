export interface LlmToolsetPromptContribution {
    id: string;
    title?: string;
    content: string;
}
export declare const useLlmToolsetPromptsStore: import("pinia").StoreDefinition<"llm-toolset-prompts", Pick<{
    activeToolsetPrompt: import("vue").ComputedRef<string>;
    clearToolsetPrompts: (provider: string) => void;
    promptsByProvider: import("vue").Ref<Record<string, LlmToolsetPromptContribution[]>, Record<string, LlmToolsetPromptContribution[]>>;
    registerToolsetPrompts: (provider: string, prompts: LlmToolsetPromptContribution[]) => void;
}, "promptsByProvider">, Pick<{
    activeToolsetPrompt: import("vue").ComputedRef<string>;
    clearToolsetPrompts: (provider: string) => void;
    promptsByProvider: import("vue").Ref<Record<string, LlmToolsetPromptContribution[]>, Record<string, LlmToolsetPromptContribution[]>>;
    registerToolsetPrompts: (provider: string, prompts: LlmToolsetPromptContribution[]) => void;
}, "activeToolsetPrompt">, Pick<{
    activeToolsetPrompt: import("vue").ComputedRef<string>;
    clearToolsetPrompts: (provider: string) => void;
    promptsByProvider: import("vue").Ref<Record<string, LlmToolsetPromptContribution[]>, Record<string, LlmToolsetPromptContribution[]>>;
    registerToolsetPrompts: (provider: string, prompts: LlmToolsetPromptContribution[]) => void;
}, "clearToolsetPrompts" | "registerToolsetPrompts">>;
