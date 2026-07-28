export interface ControllableStream<R = any> {
    stream: ReadableStream<R>;
    controller: ReadableStreamDefaultController<R>;
}
export declare function createControllableStream<R = any>(): ControllableStream<R>;
