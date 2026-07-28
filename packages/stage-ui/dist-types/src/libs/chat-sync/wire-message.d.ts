import type { ChatHistoryItem } from '@kitsune/core-agent';
import type { NewMessagesPayload, WireMessage } from '@kitsune/server-sdk-shared';
/**
 * Extract a plain-text payload from a local `ChatHistoryItem` for upload.
 *
 * Use when:
 * - Pushing a message via `sendMessages` RPC. The server schema for v1 only
 *   accepts a string `content` field — slices and tool calls cannot round-trip
 *   yet.
 *
 * Expects:
 * - Tool-result and tool-call slices are dropped silently. If you need full
 *   fidelity, wait until the server-side schema grows structured content.
 *
 * Returns:
 * - The first text slice for assistant messages with slice arrays; otherwise
 *   the message's stringified content. Empty string when nothing extractable.
 */
export declare function extractMessageText(message: ChatHistoryItem): string;
/**
 * Decide whether a local message should be mirrored to the cloud.
 *
 * Use when:
 * - Filtering messages right before `sendMessages`. Tool call / tool result
 *   exchanges are intentionally not synced in v1; system prompts also stay
 *   local since they are recomputed from settings on every device.
 *
 * Expects:
 * - The caller has already validated the message has an `id`.
 *
 * Returns:
 * - `true` when the message is one of `user` / `assistant`. `tool` / `system`
 *   / `error` roles are filtered out — error messages are local-only since
 *   they describe a per-device runtime failure, not a server-acknowledged turn.
 */
export declare function isCloudSyncableMessage(message: ChatHistoryItem): boolean;
/**
 * Convert a server `WireMessage` into a local `ChatHistoryItem`.
 *
 * Before:
 * - { id, role: 'assistant', content: 'hi', seq: 7, ... }
 *
 * After:
 * - { id, role: 'assistant', content: 'hi', slices: [{type:'text', text:'hi'}], tool_results: [], createdAt }
 *
 * Use when:
 * - Merging messages received via `pullMessages` or `newMessages` into the
 *   local session store. The local shape carries assistant-specific fields
 *   that the wire format does not, so we synthesize minimal placeholders
 *   for them.
 */
export declare function wireMessageToLocal(wire: WireMessage): ChatHistoryItem;
export interface CloudMergeResult {
    /** Merged message list (returns the original reference when nothing changed). */
    messages: ChatHistoryItem[];
    /** Highest seq seen, including the input cursor. */
    maxSeq: number;
    /** True when either `messages` or `maxSeq` differs from the input. */
    dirty: boolean;
}
/**
 * Merge a `newMessages` / `pullMessages` payload into a local message list.
 *
 * Use when:
 * - The chat session store receives an authoritative server payload
 *   (push or pull) and needs to update its in-memory list and `cloudMaxSeq`
 *   cursor without losing local-only fields on existing rows.
 *
 * Expects:
 * - `currentMessages` is the live list. Wire messages whose id already
 *   exists locally are dropped (the local copy is preserved because it may
 *   carry slices/tool_results that the wire format cannot represent).
 * - `currentMaxSeq` is the cursor previously stored on the session meta;
 *   `0` for the very first merge.
 * - `payload.messages` may arrive out of seq order (server pagination
 *   boundaries, pub/sub interleave). New messages are appended in seq order
 *   so the in-memory list stays monotonic.
 *
 * Returns:
 * - `messages` — the new array (same reference if no-op).
 * - `maxSeq` — the cursor to write back to meta.
 * - `dirty` — whether the caller should persist.
 */
export declare function mergeCloudMessagesIntoLocal(currentMessages: ChatHistoryItem[], currentMaxSeq: number, payload: Pick<NewMessagesPayload, 'messages'> & {
    toSeq?: number;
}): CloudMergeResult;
