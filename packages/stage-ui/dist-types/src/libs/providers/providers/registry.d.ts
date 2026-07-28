import type { ComposerTranslation } from 'vue-i18n';
import type { $ZodType } from 'zod/v4/core';
import type { ProviderDefinition } from '../types';
export declare function listProviders(): ProviderDefinition[];
export declare function getDefinedProvider(id: string): ProviderDefinition | undefined;
export declare function defineProvider<T>(definition: {
    createProviderConfig: (contextOptions: {
        t: ComposerTranslation;
    }) => $ZodType<T>;
} & ProviderDefinition<T>): ProviderDefinition<T>;
