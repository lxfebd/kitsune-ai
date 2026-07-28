interface ArkModelSpec {
    id: string;
    contextLength?: number;
}
interface ArkProviderDefinitionOptions {
    id: string;
    order: number;
    name: string;
    nameKey: string;
    description: string;
    descriptionKey: string;
    modelPrefix: string;
    defaultBaseUrl: string;
    icon: string;
    iconColor?: string;
    models: ArkModelSpec[];
}
export declare function createArkChatProviderDefinition(options: ArkProviderDefinitionOptions): import("..").ProviderDefinition<{
    apiKey?: string;
    baseUrl?: string;
}>;

