import type { Database } from '../../libs/db';
export interface TransactionEntry {
    userId: string;
    type: 'credit' | 'debit' | 'initial' | 'promo';
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    requestId?: string;
    description: string;
    metadata?: Record<string, unknown>;
}
export declare function createFluxTransactionService(db: Database): {
    log(entry: TransactionEntry): Promise<void>;
    logBatch(entries: TransactionEntry[]): Promise<void>;
    getHistory(userId: string, limit: number, offset: number): Promise<{
        records: {
            type: string;
            metadata: unknown;
            requestId: string | null;
            id: string;
            createdAt: Date;
            userId: string;
            description: string;
            amount: number;
            balanceBefore: number;
            balanceAfter: number;
        }[];
        hasMore: boolean;
    }>;
    getStats(userId: string): Promise<{
        capacity: number;
    }>;
};
export type FluxTransactionService = ReturnType<typeof createFluxTransactionService>;
