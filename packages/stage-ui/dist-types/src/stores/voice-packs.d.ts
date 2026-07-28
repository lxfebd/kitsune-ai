import type { VoicePackBindingInput } from './modules/persona';
export type VoicePackListItem = VoicePackBindingInput & {
    description: string | null;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};
/**
 * Loads the enabled Voice Pack library from the AIRI server.
 *
 * Use when:
 * - Settings pages need the curated Voice Pack list before binding one to the
 *   active character card.
 *
 * Expects:
 * - Voice packs were tied to the official provider, which has been removed.
 *
 * Returns:
 * - Reactive list/error/loading state plus a `load()` action.
 */
export declare const useVoicePacksStore: import("pinia").StoreDefinition<"voice-packs", Pick<{
    packs: import("vue").Ref<{
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[], VoicePackListItem[] | {
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[]>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    load: () => Promise<VoicePackListItem[]>;
}, "error" | "loading" | "packs">, Pick<{
    packs: import("vue").Ref<{
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[], VoicePackListItem[] | {
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[]>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    load: () => Promise<VoicePackListItem[]>;
}, never>, Pick<{
    packs: import("vue").Ref<{
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[], VoicePackListItem[] | {
        id: string;
        name: string;
        provider: string;
        model: string;
        voiceId: string;
        ttsModelId: string;
        params: import("./modules").VoicePackParams;
        costMultiplier: number;
        description: string | null;
        enabled: boolean;
        createdAt: string;
        updatedAt: string;
    }[]>;
    loading: import("vue").Ref<boolean, boolean>;
    error: import("vue").Ref<string | null, string | null>;
    load: () => Promise<VoicePackListItem[]>;
}, "load">>;
