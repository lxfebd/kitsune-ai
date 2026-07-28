import type { InferenceServiceProvider, InferenceServiceProviders } from '../models/inference-service-providers';
import { getDefinedProvider, listProviders } from '../libs/providers/providers';
interface RequestOptions {
    init: {
        signal: AbortSignal;
    };
}
interface RemoteResponse<T> {
    json: () => Promise<T>;
    ok: boolean;
}
/**
 * Remote inference provider API surface required by the provider service.
 */
export interface InferenceServiceProvidersRemoteClient {
    api: {
        v1: {
            providers: {
                '$get': (params?: undefined, options?: RequestOptions) => Promise<RemoteResponse<unknown[]>>;
                '$post': (params: {
                    json: InferenceServiceProvider;
                }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                ':id': {
                    $delete: (params: {
                        param: {
                            id: string;
                        };
                    }, options?: RequestOptions) => Promise<{
                        ok: boolean;
                    }>;
                    $patch: (params: {
                        json: {
                            config: Record<string, unknown>;
                            validated: boolean;
                            validationBypassed: boolean;
                        };
                        param: {
                            id: string;
                        };
                    }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                };
            };
        };
    };
}
/**
 * Options shared by inference service provider service operations.
 */
export interface InferenceServiceProviderServiceOptions {
    /**
     * Cancels the operation before or after remote IO.
     */
    abortSignal?: AbortSignal;
}
/**
 * Provider config validation state to persist remotely.
 */
export interface PatchConfigParams {
    /** Whether the provider config has passed validation. */
    validated: boolean;
    /** Whether validation was intentionally bypassed by the user. */
    validationBypassed: boolean;
}
/**
 * Inference service provider domain operations used by controller stores.
 */
export interface InferenceServiceProvidersService {
    /** Gets one built-in provider definition. */
    getDefinition: (definitionId: string) => ReturnType<typeof getDefinedProvider>;
    /** Lists built-in provider definitions. */
    listDefinitions: typeof listProviders;
    /** Builds an optimistic local provider config. */
    buildLocal: (definitionId: string, initialConfig?: Record<string, unknown>) => InferenceServiceProvider;
    /** Fetches and indexes remote provider configs. */
    fetchRemote: (client: InferenceServiceProvidersRemoteClient, options?: InferenceServiceProviderServiceOptions) => Promise<InferenceServiceProviders>;
    /** Creates and normalizes one remote provider config. */
    createRemote: (client: InferenceServiceProvidersRemoteClient, provider: InferenceServiceProvider, options?: InferenceServiceProviderServiceOptions) => Promise<InferenceServiceProvider>;
    /** Deletes one remote provider config. */
    deleteRemote: (client: InferenceServiceProvidersRemoteClient, providerId: string, options?: InferenceServiceProviderServiceOptions) => Promise<void>;
    /** Patches and normalizes one remote provider config. */
    patchConfigRemote: (client: InferenceServiceProvidersRemoteClient, providerId: string, config: Record<string, unknown>, params: PatchConfigParams, options?: InferenceServiceProviderServiceOptions) => Promise<InferenceServiceProvider>;
}
/**
 * Creates the inference service provider facade consumed by controller stores.
 *
 * Use when:
 * - Wiring controller stores to provider domain operations.
 * - Tests need to replace the whole service surface with one mock object.
 *
 * Expects:
 * - No runtime dependencies are required yet.
 *
 * Returns:
 * - A stable object containing provider domain operations.
 */
export declare function createInferenceServiceProvidersService(): InferenceServiceProvidersService;
export declare const inferenceServiceProvidersService: InferenceServiceProvidersService;

