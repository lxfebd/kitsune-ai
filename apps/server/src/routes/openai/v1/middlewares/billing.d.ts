import type { RevenueMetrics } from '../../../../otel';
import type { ConfigKVService } from '../../../../services/adapters/config-kv';
import type { UsageInfo } from '../../../../services/domain/billing/billing';
import type { BillingService } from '../../../../services/domain/billing/billing-service';
import type { FluxMeter } from '../../../../services/domain/billing/flux-meter';
import type { FluxService } from '../../../../services/domain/flux';
export interface ChatFluxDebitInput extends UsageInfo {
    billingService: BillingService;
    revenue?: RevenueMetrics | null;
    userId: string;
    requestId: string;
    model: string;
    amount: number;
    stage: 'streaming' | 'non_streaming';
    logger: {
        withFields: (fields: Record<string, unknown>) => {
            warn: (message: string) => void;
        };
    };
}
export interface ChatBillingPolicy {
    fallbackRate: number;
    fluxPer1kTokens?: number;
}
export interface TtsBillingAuthorization {
    balance: number;
    inputChars: number;
}
export interface OpenAiRouteBilling {
    authorizeChat: (userId: string) => Promise<ChatBillingPolicy>;
    authorizeTts: (userId: string, inputText: string) => Promise<TtsBillingAuthorization>;
    priceChatUsage: (usage: UsageInfo, policy: ChatBillingPolicy) => number;
    recordChatDebitFailure: (input: {
        amount: number;
        model: string;
        stage: 'streaming' | 'non_streaming';
    }) => void;
    settleChat: (input: Omit<ChatFluxDebitInput, 'billingService' | 'revenue'>) => Promise<number>;
    settleTts: (input: {
        userId: string;
        inputText: string;
        currentBalance: number;
        requestId: string;
        model: string;
    }) => Promise<{
        fluxDebited: number;
    }>;
}
export declare function createOpenAiRouteBilling(deps: {
    billingService: BillingService;
    configKV: ConfigKVService;
    fluxService: FluxService;
    revenue?: RevenueMetrics | null;
    ttsMeter: FluxMeter;
}): OpenAiRouteBilling;
export declare function debitChatFlux(input: ChatFluxDebitInput): Promise<number>;
