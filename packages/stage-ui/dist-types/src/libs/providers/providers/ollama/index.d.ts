type OllamaThinkValue = boolean | 'high' | 'low' | 'medium';
export declare function resolveOllamaThink(model: string, modeRaw: unknown): OllamaThinkValue | undefined;
export declare const providerOllama: import("../..").ProviderDefinition<{
    baseUrl?: string | undefined;
    thinkingMode?: "auto" | "high" | "low" | "medium" | "disable" | "enable" | undefined;
    headers?: Record<string, string> | undefined;
}>;

