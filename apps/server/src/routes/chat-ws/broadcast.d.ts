import type Redis from 'ioredis';
import type { ChatBroadcastPayload } from '../../utils/chat-broadcast';
import type { ChatConnectionRegistry } from './connection-registry';
/**
 * Cross-instance chat broadcast coordinator.
 */
export interface ChatBroadcastCoordinator {
    /** Subscribes this process to the user's Redis channel. */
    ensureSubscribed: (userId: string) => void;
    /** Unsubscribes once this process has no local devices for the user. */
    maybeUnsubscribe: (userId: string) => void;
    /** Publishes a validated notification for other instances to fan out locally. */
    publish: (userId: string, payload: ChatBroadcastPayload) => void;
}
export interface ChatBroadcastCoordinatorOptions {
    /** Redis connection used for publish and duplicate subscriber creation. */
    redis: Redis;
    /** Local registry that receives messages from other instances. */
    registry: ChatConnectionRegistry;
    /** Stable per-process id used to skip self-published messages. */
    instanceId: string;
}
/**
 * Creates the Redis Pub/Sub coordinator for chat websocket notifications.
 *
 * Use when:
 * - Local device fanout must also notify devices connected to other API instances.
 *
 * Expects:
 * - Redis Pub/Sub is used only as a best-effort notification channel.
 * - Durable chat truth remains in `ChatService` and clients can recover with `pullMessages`.
 *
 * Returns:
 * - A small coordinator for subscribe, unsubscribe, and publish operations.
 */
export declare function createChatBroadcastCoordinator(options: ChatBroadcastCoordinatorOptions): ChatBroadcastCoordinator;
