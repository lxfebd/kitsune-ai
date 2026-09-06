import type Redis from 'ioredis';
import type { EngagementMetrics } from '../../otel';
import type { ChatService } from '../../services/domain/chats';
/**
 * Creates websocket handlers for chat sync RPC and message fanout.
 *
 * Use when:
 * - Mounting `/ws/chat` after bearer-token auth has resolved a user id.
 *
 * Expects:
 * - `instanceId` is stable for this process so Redis echo suppression works.
 * - Redis Pub/Sub is used only for best-effort cross-instance notification.
 *
 * Returns:
 * - A per-user Hono websocket setup function.
 */
export declare function createChatWsHandlers(chatService: ChatService, redis: Redis, instanceId: string, metrics?: EngagementMetrics | null): (userId: string) => import("hono/ws").WSEvents<unknown>;
