export interface ChatBroadcastPayload {
    chatId: string;
    messages: unknown[];
    fromSeq: number;
    toSeq: number;
}
export interface ChatBroadcastMessage {
    userId: string;
    payload: ChatBroadcastPayload;
    /**
     * Stable identifier of the api instance that published this broadcast.
     *
     * The subscribing instance compares it with its own instance id and skips
     * delivery to local peers when they match — the publisher already
     * delivered locally via `broadcastToLocalDevices` and re-delivering would
     * echo every message twice on the originating instance (and once extra on
     * the sender's own ctx).
     */
    originInstanceId: string;
}
/**
 * Build a normalized chat broadcast message ready for `redis.publish`.
 *
 * Use when:
 * - The chat-ws route has just persisted new messages and needs to fan them
 *   out to other api instances over the user's pub/sub channel.
 *
 * Expects:
 * - `originInstanceId` is the publisher's stable instance id (env or nanoid
 *   fallback). It must be non-empty so the echo-skip filter on the
 *   subscriber side is reliable.
 *
 * Returns:
 * - The validated message object; callers `JSON.stringify` it before
 *   `redis.publish`.
 */
export declare function createChatBroadcastMessage(userId: string, payload: ChatBroadcastPayload, originInstanceId: string): ChatBroadcastMessage;
/**
 * Parse a raw redis pub/sub message back into a validated broadcast message.
 *
 * Use when:
 * - A subscribing api instance received a message and needs to decide
 *   whether to deliver it to local peers.
 *
 * Expects:
 * - The raw message is JSON produced by `createChatBroadcastMessage`.
 *
 * Returns:
 * - A fully validated `ChatBroadcastMessage`. Throws on schema violations so
 *   bad messages do not silently corrupt the local registry.
 */
export declare function parseChatBroadcastMessage(raw: string): ChatBroadcastMessage;
