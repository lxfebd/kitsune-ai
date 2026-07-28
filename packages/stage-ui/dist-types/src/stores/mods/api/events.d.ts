export type EventPriority = 'critical' | 'high' | 'normal' | 'low';
export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
    id: string;
    type: TType;
    time: number;
    priority?: EventPriority;
    source?: string;
    tags?: string[];
    payload: TPayload;
}
export interface EventStream<T> {
    stream: ReadableStream<T>;
    emit: (event: T) => void;
    close: () => void;
}
export declare function createEvent<TPayload>(type: string, payload: TPayload, options?: {
    priority?: EventPriority;
    source?: string;
    tags?: string[];
    id?: string;
    time?: number;
}): EventEnvelope<string, TPayload>;
export declare function createEventStream<T>(): EventStream<T>;
