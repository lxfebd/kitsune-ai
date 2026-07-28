import type { ProviderSourceDeployment } from '../libs/providers/source-metadata';
import type { LlmRoutingRule } from './settings/llm-routing';
export interface LlmRouteDecision {
    providerId: string;
    model: string;
    target: ProviderSourceDeployment;
    triggeredRule?: string;
}
export declare const useLlmRouter: import("pinia").StoreDefinition<"llm-router", Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    lastDecision: import("vue").Ref<{
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null, LlmRouteDecision | {
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null>;
    resolve: (text: string, currentProviderId: string, currentModel: string) => LlmRouteDecision;
    findCloudFallback: (excludeProviderId?: string) => {
        providerId: string;
        model: string;
    } | undefined;
    findProviderByDeployment: (deployment: ProviderSourceDeployment) => {
        id: string;
        model: string;
    } | undefined;
    getDeployment: (providerId: string) => ProviderSourceDeployment | undefined;
}, "enabled" | "rules" | "lastDecision">, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    lastDecision: import("vue").Ref<{
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null, LlmRouteDecision | {
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null>;
    resolve: (text: string, currentProviderId: string, currentModel: string) => LlmRouteDecision;
    findCloudFallback: (excludeProviderId?: string) => {
        providerId: string;
        model: string;
    } | undefined;
    findProviderByDeployment: (deployment: ProviderSourceDeployment) => {
        id: string;
        model: string;
    } | undefined;
    getDeployment: (providerId: string) => ProviderSourceDeployment | undefined;
}, never>, Pick<{
    enabled: import("@vueuse/shared").ManualResetRefReturn<boolean>;
    rules: import("@vueuse/shared").ManualResetRefReturn<LlmRoutingRule[]>;
    lastDecision: import("vue").Ref<{
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null, LlmRouteDecision | {
        providerId: string;
        model: string;
        target: ProviderSourceDeployment;
        triggeredRule?: string | undefined;
    } | null>;
    resolve: (text: string, currentProviderId: string, currentModel: string) => LlmRouteDecision;
    findCloudFallback: (excludeProviderId?: string) => {
        providerId: string;
        model: string;
    } | undefined;
    findProviderByDeployment: (deployment: ProviderSourceDeployment) => {
        id: string;
        model: string;
    } | undefined;
    getDeployment: (providerId: string) => ProviderSourceDeployment | undefined;
}, "resolve" | "findCloudFallback" | "findProviderByDeployment" | "getDeployment">>;
