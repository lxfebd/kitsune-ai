import type { Database } from '../../libs/db';
export interface RequestLogEntry {
    userId: string;
    model: string;
    status: number;
    durationMs: number;
    fluxConsumed: number;
    promptTokens?: number;
    completionTokens?: number;
}
export declare function createRequestLogService(db: Database): {
    logRequest(entry: RequestLogEntry): Promise<void>;
};
export type RequestLogService = ReturnType<typeof createRequestLogService>;
