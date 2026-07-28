import type { ChatProvider, ChatProviderWithExtraOptions, EmbedProvider, EmbedProviderWithExtraOptions, SpeechProvider, SpeechProviderWithExtraOptions, TranscriptionProvider, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils';
import type { ProgressInfo } from '@xsai-transformers/shared/types';
import type { ProviderSourceDeployment, ProviderSourcePricing } from '../libs/providers/source-metadata';
import type { ProviderOnboardingField } from '../libs/providers/types';
import type { ModelInfo, ProviderMetadata, ProviderRuntimeState, VoiceInfo } from './providers/types';
export type { ModelInfo, ProviderMetadata, ProviderRuntimeState, VoiceInfo } from './providers/types';
export declare const useProvidersStore: import("pinia").StoreDefinition<"providers", Pick<{
    providers: import("@vueuse/shared").RemovableRef<Record<string, Record<string, unknown>>>;
    getProviderConfig: (providerId: string) => Record<string, unknown>;
    addedProviders: import("@vueuse/shared").RemovableRef<Record<string, boolean>>;
    markProviderAdded: (providerId: string) => void;
    unmarkProviderAdded: (providerId: string) => void;
    deleteProvider: (providerId: string) => void;
    availableProviders: import("vue").ComputedRef<string[]>;
    configuredProviders: import("vue").ComputedRef<Record<string, boolean>>;
    providerRuntimeState: import("vue").Ref<Record<string, ProviderRuntimeState>, Record<string, ProviderRuntimeState>>;
    providerMetadata: Record<string, ProviderMetadata>;
    getProviderMetadata: (providerId: string) => {
        localizedName: string;
        localizedDescription: string;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        configured?: boolean;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    };
    getTranscriptionFeatures: (providerId: string) => {
        supportsGenerate: boolean;
        supportsStreamOutput: boolean;
        supportsStreamInput: boolean;
    };
    allProvidersMetadata: import("vue").ComputedRef<{
        localizedName: string;
        localizedDescription: string;
        configured: boolean;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    }[]>;
    initializeProvider: (providerId: string) => void;
    validateProvider: (providerId: string, options?: {
        force?: boolean;
    }) => Promise<boolean>;
    availableModels: import("vue").ComputedRef<Record<string, ModelInfo[]>>;
    isLoadingModels: import("vue").ComputedRef<Record<string, boolean>>;
    modelLoadError: import("vue").ComputedRef<Record<string, string | null>>;
    fetchModelsForProvider: (providerId: string) => Promise<ModelInfo[]>;
    getModelsForProvider: (providerId: string) => ModelInfo[];
    allAvailableModels: import("vue").ComputedRef<ModelInfo[]>;
    loadModelsForConfiguredProviders: () => Promise<void>;
    getProviderInstance: <R extends ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions>(providerId: string) => Promise<R>;
    disposeProviderInstance: (providerId: string) => Promise<void>;
    resetProviderSettings: () => Promise<void>;
    forceProviderConfigured: (providerId: string) => void;
    setProviderUnconfigured: (providerId: string) => void;
    setProviderAvailabilityOverride: (providerId: string, available: boolean) => void;
    availableProvidersMetadata: import("vue").Ref<ProviderMetadata[], ProviderMetadata[]>;
    allChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
}, "providers" | "addedProviders" | "providerRuntimeState" | "providerMetadata" | "availableProvidersMetadata">, Pick<{
    providers: import("@vueuse/shared").RemovableRef<Record<string, Record<string, unknown>>>;
    getProviderConfig: (providerId: string) => Record<string, unknown>;
    addedProviders: import("@vueuse/shared").RemovableRef<Record<string, boolean>>;
    markProviderAdded: (providerId: string) => void;
    unmarkProviderAdded: (providerId: string) => void;
    deleteProvider: (providerId: string) => void;
    availableProviders: import("vue").ComputedRef<string[]>;
    configuredProviders: import("vue").ComputedRef<Record<string, boolean>>;
    providerRuntimeState: import("vue").Ref<Record<string, ProviderRuntimeState>, Record<string, ProviderRuntimeState>>;
    providerMetadata: Record<string, ProviderMetadata>;
    getProviderMetadata: (providerId: string) => {
        localizedName: string;
        localizedDescription: string;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        configured?: boolean;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    };
    getTranscriptionFeatures: (providerId: string) => {
        supportsGenerate: boolean;
        supportsStreamOutput: boolean;
        supportsStreamInput: boolean;
    };
    allProvidersMetadata: import("vue").ComputedRef<{
        localizedName: string;
        localizedDescription: string;
        configured: boolean;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    }[]>;
    initializeProvider: (providerId: string) => void;
    validateProvider: (providerId: string, options?: {
        force?: boolean;
    }) => Promise<boolean>;
    availableModels: import("vue").ComputedRef<Record<string, ModelInfo[]>>;
    isLoadingModels: import("vue").ComputedRef<Record<string, boolean>>;
    modelLoadError: import("vue").ComputedRef<Record<string, string | null>>;
    fetchModelsForProvider: (providerId: string) => Promise<ModelInfo[]>;
    getModelsForProvider: (providerId: string) => ModelInfo[];
    allAvailableModels: import("vue").ComputedRef<ModelInfo[]>;
    loadModelsForConfiguredProviders: () => Promise<void>;
    getProviderInstance: <R extends ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions>(providerId: string) => Promise<R>;
    disposeProviderInstance: (providerId: string) => Promise<void>;
    resetProviderSettings: () => Promise<void>;
    forceProviderConfigured: (providerId: string) => void;
    setProviderUnconfigured: (providerId: string) => void;
    setProviderAvailabilityOverride: (providerId: string, available: boolean) => void;
    availableProvidersMetadata: import("vue").Ref<ProviderMetadata[], ProviderMetadata[]>;
    allChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
}, "availableProviders" | "configuredProviders" | "allProvidersMetadata" | "availableModels" | "isLoadingModels" | "modelLoadError" | "allAvailableModels" | "allChatProvidersMetadata" | "allAudioSpeechProvidersMetadata" | "allAudioTranscriptionProvidersMetadata" | "allVisionProvidersMetadata" | "configuredChatProvidersMetadata" | "configuredSpeechProvidersMetadata" | "configuredTranscriptionProvidersMetadata" | "configuredVisionProvidersMetadata" | "persistedProvidersMetadata" | "persistedChatProvidersMetadata" | "persistedSpeechProvidersMetadata" | "persistedTranscriptionProvidersMetadata" | "persistedVisionProvidersMetadata">, Pick<{
    providers: import("@vueuse/shared").RemovableRef<Record<string, Record<string, unknown>>>;
    getProviderConfig: (providerId: string) => Record<string, unknown>;
    addedProviders: import("@vueuse/shared").RemovableRef<Record<string, boolean>>;
    markProviderAdded: (providerId: string) => void;
    unmarkProviderAdded: (providerId: string) => void;
    deleteProvider: (providerId: string) => void;
    availableProviders: import("vue").ComputedRef<string[]>;
    configuredProviders: import("vue").ComputedRef<Record<string, boolean>>;
    providerRuntimeState: import("vue").Ref<Record<string, ProviderRuntimeState>, Record<string, ProviderRuntimeState>>;
    providerMetadata: Record<string, ProviderMetadata>;
    getProviderMetadata: (providerId: string) => {
        localizedName: string;
        localizedDescription: string;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        configured?: boolean;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    };
    getTranscriptionFeatures: (providerId: string) => {
        supportsGenerate: boolean;
        supportsStreamOutput: boolean;
        supportsStreamInput: boolean;
    };
    allProvidersMetadata: import("vue").ComputedRef<{
        localizedName: string;
        localizedDescription: string;
        configured: boolean;
        id: string;
        to?: string;
        order?: number;
        category: "chat" | "embed" | "speech" | "transcription" | "vision";
        tasks: string[];
        nameKey: string;
        name: string;
        descriptionKey: string;
        description: string;
        isAvailableBy?: () => Promise<boolean> | boolean;
        icon?: string;
        iconColor?: string;
        iconImage?: string;
        defaultOptions?: () => Record<string, unknown>;
        onboardingFields?: ProviderOnboardingField[];
        createProvider: (config: Record<string, unknown>) => ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions | Promise<ChatProvider> | Promise<ChatProviderWithExtraOptions> | Promise<EmbedProvider> | Promise<EmbedProviderWithExtraOptions> | Promise<SpeechProvider> | Promise<SpeechProviderWithExtraOptions> | Promise<TranscriptionProvider> | Promise<TranscriptionProviderWithExtraOptions>;
        capabilities: {
            listModels?: (config: Record<string, unknown>) => Promise<ModelInfo[]>;
            listVoices?: (config: Record<string, unknown>, model?: string) => Promise<VoiceInfo[]>;
            loadModel?: (config: Record<string, unknown>, hooks?: {
                onProgress?: (progress: ProgressInfo) => Promise<void> | void;
            }) => Promise<void>;
        };
        validators: {
            validateProviderConfig: (config: Record<string, unknown>, options?: {
                skipChatPingCheck?: boolean;
                onlyChatPingCheck?: boolean;
            }) => Promise<{
                errors: unknown[];
                reason: string;
                valid: boolean;
            }> | {
                errors: unknown[];
                reason: string;
                valid: boolean;
            };
            chatPingCheckAvailable: boolean;
        };
        requiresCredentials?: boolean;
        transcriptionFeatures?: {
            supportsGenerate: boolean;
            supportsStreamOutput: boolean;
            supportsStreamInput: boolean;
        };
        pricing?: ProviderSourcePricing;
        deployment?: ProviderSourceDeployment;
    }[]>;
    initializeProvider: (providerId: string) => void;
    validateProvider: (providerId: string, options?: {
        force?: boolean;
    }) => Promise<boolean>;
    availableModels: import("vue").ComputedRef<Record<string, ModelInfo[]>>;
    isLoadingModels: import("vue").ComputedRef<Record<string, boolean>>;
    modelLoadError: import("vue").ComputedRef<Record<string, string | null>>;
    fetchModelsForProvider: (providerId: string) => Promise<ModelInfo[]>;
    getModelsForProvider: (providerId: string) => ModelInfo[];
    allAvailableModels: import("vue").ComputedRef<ModelInfo[]>;
    loadModelsForConfiguredProviders: () => Promise<void>;
    getProviderInstance: <R extends ChatProvider | ChatProviderWithExtraOptions | EmbedProvider | EmbedProviderWithExtraOptions | SpeechProvider | SpeechProviderWithExtraOptions | TranscriptionProvider | TranscriptionProviderWithExtraOptions>(providerId: string) => Promise<R>;
    disposeProviderInstance: (providerId: string) => Promise<void>;
    resetProviderSettings: () => Promise<void>;
    forceProviderConfigured: (providerId: string) => void;
    setProviderUnconfigured: (providerId: string) => void;
    setProviderAvailabilityOverride: (providerId: string, available: boolean) => void;
    availableProvidersMetadata: import("vue").Ref<ProviderMetadata[], ProviderMetadata[]>;
    allChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allAudioTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    allVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    configuredVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedChatProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedSpeechProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedTranscriptionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
    persistedVisionProvidersMetadata: import("vue").ComputedRef<ProviderMetadata[]>;
}, "validateProvider" | "getProviderConfig" | "markProviderAdded" | "unmarkProviderAdded" | "deleteProvider" | "getProviderMetadata" | "getTranscriptionFeatures" | "initializeProvider" | "fetchModelsForProvider" | "getModelsForProvider" | "loadModelsForConfiguredProviders" | "getProviderInstance" | "disposeProviderInstance" | "resetProviderSettings" | "forceProviderConfigured" | "setProviderUnconfigured" | "setProviderAvailabilityOverride">>;
