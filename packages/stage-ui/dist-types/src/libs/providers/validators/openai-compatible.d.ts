import type { ProviderDefinition } from '../types';
import { ProviderValidationCheck } from '../types';
interface OpenAICompatibleValidationOptions<TConfig extends {
    apiKey?: string;
    baseUrl?: string;
}> {
    checks?: ProviderValidationCheck[];
    additionalHeaders?: Record<string, string>;
    allowValidationWithoutModel?: boolean;
    normalizeModelId?: (modelId: string) => string;
    schedule?: {
        mode: 'once' | 'interval';
        intervalMs?: number;
    };
    skipApiKeyCheck?: boolean;
    connectivityFailureReason?: (input: {
        config: TConfig;
        error: unknown;
        errorMessage: string;
    }) => string;
    modelListFailureReason?: (input: {
        config: TConfig;
        error: unknown;
        errorMessage: string;
    }) => string;
}
export declare function createOpenAICompatibleValidators<TConfig extends {
    apiKey?: string;
    baseUrl?: string;
}>(options?: OpenAICompatibleValidationOptions<TConfig>): ProviderDefinition<TConfig>['validators'];

