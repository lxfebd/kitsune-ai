import type { Card, ccv3 } from '@kitsune/ccc';
export type VoicePackParams = Record<string, string | number | boolean | null>;
export interface VoicePackBindingInput {
    id: string;
    name: string;
    provider: string;
    model: string;
    voiceId: string;
    ttsModelId: string;
    params: VoicePackParams;
    costMultiplier: number;
}
export interface VoicePackSnapshot {
    packId: string;
    name: string;
    provider: string;
    model: string;
    voiceId: string;
    ttsModelId: string;
    params: VoicePackParams;
    costMultiplier: number;
}
export interface KitsuneExtension {
    modules: {
        consciousness: {
            provider: string;
            model: string;
        };
        vision: {
            provider: string;
            model: string;
        };
        speech: {
            provider: string;
            model: string;
            voice_id: string;
            pitch?: number;
            rate?: number;
            ssml?: boolean;
            language?: string;
            voicePack?: VoicePackSnapshot;
        };
        vrm?: {
            source?: 'file' | 'url';
            file?: string;
            url?: string;
        };
        live2d?: {
            source?: 'file' | 'url';
            file?: string;
            url?: string;
        };
        displayModelId?: string;
        activeBackgroundId?: string;
        artistry?: {
            enabled?: boolean;
            provider?: string;
            model?: string;
            promptPrefix?: string;
            workflowId?: string;
            widgetInstruction?: string;
            spawnMode?: 'bg' | 'widget' | 'inline' | 'bg_widget';
            options?: Record<string, any>;
            autonomousEnabled?: boolean;
            autonomousThreshold?: number;
            autonomousTarget?: 'user' | 'assistant';
        };
        persona?: {
            /**人格模式: rational | idol | hybrid | strict */
            mode?: 'rational' | 'idol' | 'hybrid' | 'strict';
            /** 角色灵魂 — 核心人格定义 */
            soul?: string;
            /** 角色身份 — 行为准则和说话风格 */
            identity?: string;
            /** 称呼设置 */
            addressing?: {
                defaultUserTitle?: string;
                customName?: string;
                useCustomFirst?: boolean;
            };
            /** 引导设置 */
            guidance?: {
                promptIfMissingName?: boolean;
                remindCooldownHours?: number;
            };
        };
        character?: {
            voice?: {
                adapter: string;
                voiceId: string;
                speed?: number;
                pitch?: number;
                volume?: number;
            };
            model?: {
                engine: 'live2d' | 'spine' | 'three';
                source: string;
                scale?: number;
                offset?: {
                    x: number;
                    y: number;
                };
                initialMotion?: string;
                initialExpression?: string;
            };
            expressions?: Array<{
                emotion: string;
                live2dExpression?: string;
                spineAnimation?: string;
                vrmExpression?: string;
            }>;
            tags?: string[];
        };
    };
    agents: {
        [key: string]: {
            prompt: string;
            enabled?: boolean;
        };
    };
}
export interface KitsuneCard extends Card {
    extensions: {
        kitsune: KitsuneExtension;
    } & Card['extensions'];
}
/** @deprecated Use KitsuneCard instead. Kept for type-level backward compatibility. */
export type AiriCard = KitsuneCard;
/** @deprecated Use KitsuneExtension instead. Kept for type-level backward compatibility. */
export type AiriExtension = KitsuneExtension;
export declare const usePersonaStore: import("pinia").StoreDefinition<"persona", Pick<{
    cards: import("@vueuse/shared").ManualResetRefReturn<Map<string, KitsuneCard>>;
    activeCard: import("vue").ComputedRef<KitsuneCard | undefined>;
    activeCardId: import("@vueuse/shared").ManualResetRefReturn<string>;
    addCard: (card: KitsuneCard | Card | ccv3.CharacterCardV3) => string;
    removeCard: (id: string) => void;
    updateCard: (id: string, updates: KitsuneCard | Card | ccv3.CharacterCardV3) => boolean;
    bindVoicePackToActiveCard: (_pack: VoicePackBindingInput) => boolean;
    updateActiveCardConsciousness: (consciousness: KitsuneExtension["modules"]["consciousness"]) => boolean;
    updateActiveCardDisplayModel: (displayModelId: string | undefined) => boolean;
    updateActiveCardSpeech: (speech: Pick<KitsuneExtension["modules"]["speech"], "provider" | "model" | "voice_id">) => boolean;
    updateActiveCardVision: (vision: KitsuneExtension["modules"]["vision"]) => boolean;
    getCard: (id: string) => KitsuneCard | undefined;
    resetState: () => void;
    initialize: () => void;
    currentModels: import("vue").ComputedRef<{
        consciousness: {
            provider: string;
            model: string;
        };
        vision: {
            provider: string;
            model: string;
        };
        speech: {
            provider: string;
            model: string;
            voice_id: string;
            voicePack: VoicePackSnapshot | undefined;
        };
        displayModelId: string;
        activeBackgroundId: string | undefined;
    }>;
    systemPrompt: import("vue").ComputedRef<string>;
}, "cards" | "activeCardId">, Pick<{
    cards: import("@vueuse/shared").ManualResetRefReturn<Map<string, KitsuneCard>>;
    activeCard: import("vue").ComputedRef<KitsuneCard | undefined>;
    activeCardId: import("@vueuse/shared").ManualResetRefReturn<string>;
    addCard: (card: KitsuneCard | Card | ccv3.CharacterCardV3) => string;
    removeCard: (id: string) => void;
    updateCard: (id: string, updates: KitsuneCard | Card | ccv3.CharacterCardV3) => boolean;
    bindVoicePackToActiveCard: (_pack: VoicePackBindingInput) => boolean;
    updateActiveCardConsciousness: (consciousness: KitsuneExtension["modules"]["consciousness"]) => boolean;
    updateActiveCardDisplayModel: (displayModelId: string | undefined) => boolean;
    updateActiveCardSpeech: (speech: Pick<KitsuneExtension["modules"]["speech"], "provider" | "model" | "voice_id">) => boolean;
    updateActiveCardVision: (vision: KitsuneExtension["modules"]["vision"]) => boolean;
    getCard: (id: string) => KitsuneCard | undefined;
    resetState: () => void;
    initialize: () => void;
    currentModels: import("vue").ComputedRef<{
        consciousness: {
            provider: string;
            model: string;
        };
        vision: {
            provider: string;
            model: string;
        };
        speech: {
            provider: string;
            model: string;
            voice_id: string;
            voicePack: VoicePackSnapshot | undefined;
        };
        displayModelId: string;
        activeBackgroundId: string | undefined;
    }>;
    systemPrompt: import("vue").ComputedRef<string>;
}, "activeCard" | "currentModels" | "systemPrompt">, Pick<{
    cards: import("@vueuse/shared").ManualResetRefReturn<Map<string, KitsuneCard>>;
    activeCard: import("vue").ComputedRef<KitsuneCard | undefined>;
    activeCardId: import("@vueuse/shared").ManualResetRefReturn<string>;
    addCard: (card: KitsuneCard | Card | ccv3.CharacterCardV3) => string;
    removeCard: (id: string) => void;
    updateCard: (id: string, updates: KitsuneCard | Card | ccv3.CharacterCardV3) => boolean;
    bindVoicePackToActiveCard: (_pack: VoicePackBindingInput) => boolean;
    updateActiveCardConsciousness: (consciousness: KitsuneExtension["modules"]["consciousness"]) => boolean;
    updateActiveCardDisplayModel: (displayModelId: string | undefined) => boolean;
    updateActiveCardSpeech: (speech: Pick<KitsuneExtension["modules"]["speech"], "provider" | "model" | "voice_id">) => boolean;
    updateActiveCardVision: (vision: KitsuneExtension["modules"]["vision"]) => boolean;
    getCard: (id: string) => KitsuneCard | undefined;
    resetState: () => void;
    initialize: () => void;
    currentModels: import("vue").ComputedRef<{
        consciousness: {
            provider: string;
            model: string;
        };
        vision: {
            provider: string;
            model: string;
        };
        speech: {
            provider: string;
            model: string;
            voice_id: string;
            voicePack: VoicePackSnapshot | undefined;
        };
        displayModelId: string;
        activeBackgroundId: string | undefined;
    }>;
    systemPrompt: import("vue").ComputedRef<string>;
}, "initialize" | "resetState" | "addCard" | "removeCard" | "updateCard" | "bindVoicePackToActiveCard" | "updateActiveCardConsciousness" | "updateActiveCardDisplayModel" | "updateActiveCardSpeech" | "updateActiveCardVision" | "getCard">>;
