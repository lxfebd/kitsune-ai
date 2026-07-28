import type { ChatStreamEventContext } from '../../../types/chat';
import type { SparkNotifyPerformanceResult, SparkNotifyReactionOptions } from './spark-notify-reaction';
export declare function normalizeContextSnapshot<C extends Pick<ChatStreamEventContext, 'contexts'>>(contexts: C): C;
export declare const useContextBridgeStore: import("pinia").StoreDefinition<"mods:api:context-bridge", Pick<{
    initialize: () => Promise<void>;
    dispose: () => Promise<void>;
    dispatchSparkNotifyReaction: (options: SparkNotifyReactionOptions) => Promise<string>;
    dispatchSparkNotifyPerformance: (options: SparkNotifyReactionOptions) => Promise<SparkNotifyPerformanceResult>;
    setSparkNotifyHostRole: (role: "main" | "client") => void;
}, never>, Pick<{
    initialize: () => Promise<void>;
    dispose: () => Promise<void>;
    dispatchSparkNotifyReaction: (options: SparkNotifyReactionOptions) => Promise<string>;
    dispatchSparkNotifyPerformance: (options: SparkNotifyReactionOptions) => Promise<SparkNotifyPerformanceResult>;
    setSparkNotifyHostRole: (role: "main" | "client") => void;
}, never>, Pick<{
    initialize: () => Promise<void>;
    dispose: () => Promise<void>;
    dispatchSparkNotifyReaction: (options: SparkNotifyReactionOptions) => Promise<string>;
    dispatchSparkNotifyPerformance: (options: SparkNotifyReactionOptions) => Promise<SparkNotifyPerformanceResult>;
    setSparkNotifyHostRole: (role: "main" | "client") => void;
}, "dispose" | "initialize" | "dispatchSparkNotifyReaction" | "dispatchSparkNotifyPerformance" | "setSparkNotifyHostRole">>;
