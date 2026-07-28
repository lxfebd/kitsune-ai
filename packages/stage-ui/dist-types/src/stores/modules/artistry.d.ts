export interface ResolvedArtistryConfig {
    provider?: string;
    model?: string;
    promptPrefix?: string;
    options?: Record<string, any>;
    globals: Record<string, any>;
}
export interface ComfyUIWorkflowTemplate {
    id: string;
    name: string;
    workflow: Record<string, any>;
    exposedFields: Record<string, string[]>;
}
export declare const useArtistryStore: import("pinia").StoreDefinition<"artistry", Pick<{
    configured: import("vue").ComputedRef<boolean>;
    artistryGlobals: import("vue").ComputedRef<{
        comfyuiServerUrl: string;
        comfyuiSavedWorkflows: ComfyUIWorkflowTemplate[];
        comfyuiActiveWorkflow: string;
        replicateApiKey: string;
        replicateDefaultModel: string;
        replicateAspectRatio: string;
        replicateInferenceSteps: number;
        nanobananaApiKey: string;
        nanobananaModel: string;
        nanobananaResolution: string;
    }>;
    activeProvider: import("vue").Ref<string, string>;
    activeModel: import("vue").Ref<string, string>;
    defaultPromptPrefix: import("vue").Ref<string, string>;
    providerOptions: import("vue").Ref<Record<string, any> | undefined, Record<string, any> | undefined>;
    globalProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalPromptPrefix: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalProviderOptions: import("@vueuse/shared").ManualResetRefReturn<Record<string, any> | undefined>;
    comfyuiServerUrl: import("@vueuse/shared").ManualResetRefReturn<string>;
    comfyuiSavedWorkflows: import("@vueuse/shared").ManualResetRefReturn<ComfyUIWorkflowTemplate[]>;
    comfyuiActiveWorkflow: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateDefaultModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateAspectRatio: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateInferenceSteps: import("@vueuse/shared").ManualResetRefReturn<number>;
    nanobananaApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaResolution: import("@vueuse/shared").ManualResetRefReturn<string>;
    resetToGlobal: () => void;
    resetState: () => void;
}, "activeProvider" | "activeModel" | "defaultPromptPrefix" | "providerOptions" | "globalProvider" | "globalModel" | "globalPromptPrefix" | "globalProviderOptions" | "comfyuiServerUrl" | "comfyuiSavedWorkflows" | "comfyuiActiveWorkflow" | "replicateApiKey" | "replicateDefaultModel" | "replicateAspectRatio" | "replicateInferenceSteps" | "nanobananaApiKey" | "nanobananaModel" | "nanobananaResolution">, Pick<{
    configured: import("vue").ComputedRef<boolean>;
    artistryGlobals: import("vue").ComputedRef<{
        comfyuiServerUrl: string;
        comfyuiSavedWorkflows: ComfyUIWorkflowTemplate[];
        comfyuiActiveWorkflow: string;
        replicateApiKey: string;
        replicateDefaultModel: string;
        replicateAspectRatio: string;
        replicateInferenceSteps: number;
        nanobananaApiKey: string;
        nanobananaModel: string;
        nanobananaResolution: string;
    }>;
    activeProvider: import("vue").Ref<string, string>;
    activeModel: import("vue").Ref<string, string>;
    defaultPromptPrefix: import("vue").Ref<string, string>;
    providerOptions: import("vue").Ref<Record<string, any> | undefined, Record<string, any> | undefined>;
    globalProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalPromptPrefix: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalProviderOptions: import("@vueuse/shared").ManualResetRefReturn<Record<string, any> | undefined>;
    comfyuiServerUrl: import("@vueuse/shared").ManualResetRefReturn<string>;
    comfyuiSavedWorkflows: import("@vueuse/shared").ManualResetRefReturn<ComfyUIWorkflowTemplate[]>;
    comfyuiActiveWorkflow: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateDefaultModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateAspectRatio: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateInferenceSteps: import("@vueuse/shared").ManualResetRefReturn<number>;
    nanobananaApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaResolution: import("@vueuse/shared").ManualResetRefReturn<string>;
    resetToGlobal: () => void;
    resetState: () => void;
}, "configured" | "artistryGlobals">, Pick<{
    configured: import("vue").ComputedRef<boolean>;
    artistryGlobals: import("vue").ComputedRef<{
        comfyuiServerUrl: string;
        comfyuiSavedWorkflows: ComfyUIWorkflowTemplate[];
        comfyuiActiveWorkflow: string;
        replicateApiKey: string;
        replicateDefaultModel: string;
        replicateAspectRatio: string;
        replicateInferenceSteps: number;
        nanobananaApiKey: string;
        nanobananaModel: string;
        nanobananaResolution: string;
    }>;
    activeProvider: import("vue").Ref<string, string>;
    activeModel: import("vue").Ref<string, string>;
    defaultPromptPrefix: import("vue").Ref<string, string>;
    providerOptions: import("vue").Ref<Record<string, any> | undefined, Record<string, any> | undefined>;
    globalProvider: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalPromptPrefix: import("@vueuse/shared").ManualResetRefReturn<string>;
    globalProviderOptions: import("@vueuse/shared").ManualResetRefReturn<Record<string, any> | undefined>;
    comfyuiServerUrl: import("@vueuse/shared").ManualResetRefReturn<string>;
    comfyuiSavedWorkflows: import("@vueuse/shared").ManualResetRefReturn<ComfyUIWorkflowTemplate[]>;
    comfyuiActiveWorkflow: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateDefaultModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateAspectRatio: import("@vueuse/shared").ManualResetRefReturn<string>;
    replicateInferenceSteps: import("@vueuse/shared").ManualResetRefReturn<number>;
    nanobananaApiKey: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaModel: import("@vueuse/shared").ManualResetRefReturn<string>;
    nanobananaResolution: import("@vueuse/shared").ManualResetRefReturn<string>;
    resetToGlobal: () => void;
    resetState: () => void;
}, "resetState" | "resetToGlobal">>;
/**
 * Resolves Artistry configuration from a Pinia store instance.
 *
 * This utility handles the divergence between Vue components (where Pinia state is auto-unwrapped)
 * and headless service/tool contexts (where state properties remain as Refs).
 *
 * @param store - The artistry store instance (from useArtistryStore())
 */
export declare function resolveArtistryConfigFromStore(store: any): ResolvedArtistryConfig;
