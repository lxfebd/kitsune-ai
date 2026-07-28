export interface UsageInfo {
    promptTokens?: number;
    completionTokens?: number;
}
export declare function extractUsageFromBody(body: any): UsageInfo;
export declare function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number;
