import type { SparkNotifyResponseControl } from '@kitsune/core-agent/agents/spark-notify';
import type { LlmStreamingControlCallManifest } from '@kitsune/pipelines-audio';
import type { WebSocketEventOf } from '@kitsune/server-sdk';
type SparkNotifyProtocolEvent = WebSocketEventOf<'spark:notify'>;
type SparkNotifyProtocolData = SparkNotifyProtocolEvent['data'];
export type SparkNotifyReactionCallHandler = (payload?: Record<string, unknown>) => Promise<void> | void;
/**
 * Registered performance call available during one spark notify reaction.
 */
export interface SparkNotifyReactionCallRegistration {
    /** Prompt manifest rendered into the model instructions and used as the dispatch key. */
    manifest: LlmStreamingControlCallManifest;
    /** Runtime callback executed when the matching CALL token is emitted. */
    handler: SparkNotifyReactionCallHandler;
}
/**
 * Result returned by the call-aware spark notify reaction bridge.
 */
export interface SparkNotifyPerformanceResult {
    /** Text reaction produced by the existing spark notify path. */
    reaction: string;
    /** Terminal state for the performance request. */
    type: 'called' | 'completed' | 'timeout' | 'cancelled';
    /** Name of the generic performance call that resolved the request, when applicable. */
    name?: string;
    /** Payload emitted by the matching CALL token, when applicable. */
    payload?: Record<string, unknown>;
}
/**
 * Caller-facing request used by the context bridge to turn one spark notification into a reaction string.
 */
export interface SparkNotifyReactionOptions extends Partial<Pick<SparkNotifyProtocolData, 'lane' | 'note' | 'payload' | 'ttlMs' | 'requiresAck' | 'metadata'>>, SparkNotifyResponseControl {
    /** Short title for the event that should be visible to the reaction runtime. */
    headline: SparkNotifyProtocolData['headline'];
    /** Response text returned when the reaction runtime cannot produce a usable response. */
    fallbackResponseText: string;
    /**
     * Notification category.
     *
     * @default 'ping'
     */
    kind?: SparkNotifyProtocolData['kind'];
    /**
     * Notification scheduling urgency.
     *
     * @default 'immediate'
     */
    urgency?: SparkNotifyProtocolData['urgency'];
    /**
     * Target reaction destinations.
     *
     * @default ['character']
     */
    destinations?: SparkNotifyProtocolData['destinations'];
    /**
     * Event source label used by the downstream spark notification event.
     *
     * @default 'plugin-module-host'
     */
    source?: SparkNotifyProtocolEvent['source'];
    /** Generic performance calls allowed during this spark notify reaction request. */
    calls?: SparkNotifyReactionCallRegistration[];
    /**
     * Maximum time to wait for a registered performance call after spark notify starts.
     *
     * @default 5000
     */
    timeoutMs?: number;
}
export declare const sparkNotifyReactionOptionsSchema: import("valibot").LooseObjectSchema<{
    readonly headline: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").TrimAction, import("valibot").NonEmptyAction<string, undefined>]>;
    readonly fallbackResponseText: import("valibot").StringSchema<undefined>;
    readonly kind: import("valibot").OptionalSchema<import("valibot").PicklistSchema<["alarm", "ping", "reminder"], undefined>, undefined>;
    readonly urgency: import("valibot").OptionalSchema<import("valibot").PicklistSchema<["immediate", "soon", "later"], undefined>, undefined>;
    readonly note: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly payload: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").UnknownSchema, undefined>, undefined>;
    readonly metadata: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").UnknownSchema, undefined>, undefined>;
    readonly lane: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly destinations: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>, undefined>;
    readonly source: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly ttlMs: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").FiniteAction<number, undefined>]>, undefined>;
    readonly requiresAck: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, undefined>;
    readonly forceResponse: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, undefined>;
    readonly forceTextResponse: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, undefined>;
    readonly forceSparkCommandResponse: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, undefined>;
}, undefined>;

