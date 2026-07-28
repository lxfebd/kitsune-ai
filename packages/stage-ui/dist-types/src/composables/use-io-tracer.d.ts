import type { Span } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
export type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
export interface SerializedSpan {
    traceId: string;
    spanId: string;
    parentSpanId: string;
    name: string;
    kind: number;
    startTimeNano: string;
    endTimeNano: string;
    attributes: Record<string, unknown>;
    events: {
        name: string;
        timeNano: string;
        attributes: Record<string, unknown>;
    }[];
    status: {
        code: number;
        message: string;
    };
    ended: boolean;
}
export declare function deserializeSpan(s: SerializedSpan): ReadableSpan;
type SpanCallback = (span: ReadableSpan) => void;
export declare function createCallbackSpanExporter(): SpanExporter;
export declare function initIOTracer(): void;
export declare function getIOTracer(): import("@opentelemetry/api").Tracer;
export declare function onIOSpan(cb: SpanCallback | undefined): void;
export declare function onRemoteIOSpan(cb: SpanCallback): () => void;
export declare function startSpan(name: string, parent?: Span, attrs?: Record<string, string | number | boolean>): Span;
export declare const activeTurnSpan: import("vue").ShallowRef<Span | undefined, Span | undefined>;
