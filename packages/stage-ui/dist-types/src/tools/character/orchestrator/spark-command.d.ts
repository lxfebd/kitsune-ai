import type { WebSocketEvents } from '@kitsune/server-sdk';
export interface CreateSparkCommandToolOptions {
    sendSparkCommand: (command: WebSocketEvents['spark:command']) => void;
}
export declare function createSparkCommandTool(options: CreateSparkCommandToolOptions): Promise<import("@xsai/shared-chat").Tool[]>;
