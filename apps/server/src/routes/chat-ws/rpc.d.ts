import type { HonoWsInvocableEventContext } from '@moeru/eventa/adapters/websocket/hono';
import type { EngagementMetrics } from '../../otel';
import type { ChatService } from '../../services/domain/chats';
import type { ChatBroadcastCoordinator } from './broadcast';
import type { ChatConnectionRegistry } from './connection-registry';
export interface RegisterChatRpcHandlersOptions {
    /** Eventa websocket context for the connected peer. */
    ctx: HonoWsInvocableEventContext;
    /** Authenticated user that owns this websocket connection. */
    userId: string;
    /** Domain service that persists and reads chat messages. */
    chatService: ChatService;
    /** Local websocket registry for same-instance fanout. */
    registry: ChatConnectionRegistry;
    /** Redis coordinator for cross-instance fanout. */
    broadcast: ChatBroadcastCoordinator;
    /** Optional engagement metrics. */
    metrics?: EngagementMetrics | null;
}
/**
 * Registers chat Eventa RPC handlers on one websocket context.
 *
 * Use when:
 * - A peer context has just been created by the Hono Eventa adapter.
 *
 * Expects:
 * - `chatService` enforces membership and message sequencing.
 *
 * Returns:
 * - Nothing; handlers are attached to the provided context.
 */
export declare function registerChatRpcHandlers(options: RegisterChatRpcHandlersOptions): void;
