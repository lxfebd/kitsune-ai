export interface PluginHostProviderSummary {
    name: string;
}
export declare function listProvidersForPluginHost(): PluginHostProviderSummary[];
export declare function shouldPublishPluginHostCapabilities(): boolean;
