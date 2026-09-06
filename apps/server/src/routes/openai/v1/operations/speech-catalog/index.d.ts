import type { V1RouteDeps } from '../../types';
export interface SpeechCatalogOperation {
    listSpeechModels: () => Promise<Response>;
    listStreamingSpeechModels: () => Promise<Response>;
    listStreamingVoices: (input: ListStreamingVoicesInput) => Promise<Response>;
    listVoices: (input: ListVoicesInput) => Promise<Response>;
}
export interface ListStreamingVoicesInput {
    model?: string;
}
export interface ListVoicesInput {
    requestedModel?: string;
}
export declare function createSpeechCatalogOperation(deps: V1RouteDeps): SpeechCatalogOperation;
