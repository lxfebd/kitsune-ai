import type { ProviderSourceDeployment } from '../../libs/providers/source-metadata';
export interface LlmRoutingCondition {
    /** Minimum character count to trigger this rule. */
    minLength?: number;
    /** Maximum character count to trigger this rule. */
    maxLength?: number;
    /** If any of these keywords appear in the message, trigger this rule. */
    keywords?: string[];
    /** Trigger if the message contains code blocks (``` or indented code). */
    codeBlock?: boolean;
    /** Trigger if the message requires tool calling (detected by presence of tool-related keywords). */
    toolCall?: boolean;
}
export interface LlmRoutingRule {
    id: string;
    name: string;
    enabled: boolean;
    conditions: LlmRoutingCondition;
    target: ProviderSourceDeployment;
    priority: number;
}
export interface LlmRoutingConfig {
    enabled: boolean;
    rules: LlmRoutingRule[];
}
export declare const useSettingsLlmRouting: import("pinia").StoreDefinition<"settings-llm-routing", Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    addRule: (rule: Omit<LlmRoutingRule, "id">) => void;
    updateRule: (id: string, patch: Partial<LlmRoutingRule>) => void;
    removeRule: (id: string) => void;
    toggleRule: (id: string) => void;
    resetState: () => void;
}, "enabled" | "rules">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    addRule: (rule: Omit<LlmRoutingRule, "id">) => void;
    updateRule: (id: string, patch: Partial<LlmRoutingRule>) => void;
    removeRule: (id: string) => void;
    toggleRule: (id: string) => void;
    resetState: () => void;
}, never>, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    addRule: (rule: Omit<LlmRoutingRule, "id">) => void;
    updateRule: (id: string, patch: Partial<LlmRoutingRule>) => void;
    removeRule: (id: string) => void;
    toggleRule: (id: string) => void;
    resetState: () => void;
}, "resetState" | "addRule" | "updateRule" | "removeRule" | "toggleRule">>;
