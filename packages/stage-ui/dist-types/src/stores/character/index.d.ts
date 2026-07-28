import { useLlmmarkerParser } from '../../composables/llm-marker-parser';
export * from './notebook';
export * from './orchestrator';
export interface CharacterSparkNotifyReaction {
    id: string;
    message: string;
    createdAt: number;
    sourceEventId?: string;
    metadata?: Record<string, unknown>;
}
type ParserFactory = typeof useLlmmarkerParser;
export declare function setCharacterLlmMarkerParserFactoryForTest(factory: ParserFactory | null): void;
export declare const useCharacterStore: import("pinia").StoreDefinition<"character", Pick<{
    name: import("vue").ComputedRef<string>;
    reactions: import("vue").Ref<{
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], CharacterSparkNotifyReaction[] | {
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    systemPrompt: import("vue").ComputedRef<string>;
    recordSparkNotifyReaction: (sparkEventId: string, message: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEvent: (sparkEventId: string, chunk: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEnd: (sparkEventId: string, fullText: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    clearReactions: () => void;
    emitTextOutput: (text: string) => Promise<void>;
}, "reactions">, Pick<{
    name: import("vue").ComputedRef<string>;
    reactions: import("vue").Ref<{
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], CharacterSparkNotifyReaction[] | {
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    systemPrompt: import("vue").ComputedRef<string>;
    recordSparkNotifyReaction: (sparkEventId: string, message: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEvent: (sparkEventId: string, chunk: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEnd: (sparkEventId: string, fullText: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    clearReactions: () => void;
    emitTextOutput: (text: string) => Promise<void>;
}, "name" | "systemPrompt">, Pick<{
    name: import("vue").ComputedRef<string>;
    reactions: import("vue").Ref<{
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[], CharacterSparkNotifyReaction[] | {
        id: string;
        message: string;
        createdAt: number;
        sourceEventId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[]>;
    systemPrompt: import("vue").ComputedRef<string>;
    recordSparkNotifyReaction: (sparkEventId: string, message: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEvent: (sparkEventId: string, chunk: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    onSparkNotifyReactionStreamEnd: (sparkEventId: string, fullText: string, options?: {
        metadata?: Record<string, unknown>;
    }) => void;
    clearReactions: () => void;
    emitTextOutput: (text: string) => Promise<void>;
}, "recordSparkNotifyReaction" | "onSparkNotifyReactionStreamEvent" | "onSparkNotifyReactionStreamEnd" | "clearReactions" | "emitTextOutput">>;
