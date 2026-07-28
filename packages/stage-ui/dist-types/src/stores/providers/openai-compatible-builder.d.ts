import type { ProviderMetadata } from '../providers';
import { ProviderValidationCheck } from '../../libs/providers';
type ProviderCreator = (apiKey: string, baseUrl: string) => any;
export declare function buildOpenAICompatibleProvider(options: Partial<ProviderMetadata> & {
    id: string;
    name: string;
    icon: string;
    description: string;
    nameKey: string;
    descriptionKey: string;
    category?: 'chat' | 'embed' | 'speech' | 'transcription';
    tasks?: string[];
    defaultBaseUrl?: string;
    creator: ProviderCreator;
    capabilities?: ProviderMetadata['capabilities'];
    validators?: ProviderMetadata['validators'];
    validation?: ProviderValidationCheck[];
    additionalHeaders?: Record<string, string>;
    transcriptionFeatures?: ProviderMetadata['transcriptionFeatures'];
}): ProviderMetadata;

