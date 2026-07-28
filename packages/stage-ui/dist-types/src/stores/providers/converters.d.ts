import type { ComposerTranslation } from 'vue-i18n';
import type { ProviderDefinition } from '../../libs';
import type { ProviderMetadata } from '../providers';
export declare function convertProviderDefinitionToMetadata(definition: ProviderDefinition<any>, t: ComposerTranslation, options?: {
    fallbackDefaultOptions?: ProviderMetadata['defaultOptions'];
}): ProviderMetadata;
export declare function convertProviderDefinitionsToMetadata(definitions: ProviderDefinition<any>[], t: ComposerTranslation, currentMetadata: Record<string, ProviderMetadata>): Record<string, ProviderMetadata>;
