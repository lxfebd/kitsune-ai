import type { WireMessage } from '@kitsune/server-sdk-shared';
import type { Database } from '../../libs/db';
import type { EngagementMetrics } from '../../otel';
import type { ProductEventService } from './product-events';
type ChatType = 'private' | 'bot' | 'group' | 'channel';
type ChatMemberType = 'user' | 'character' | 'bot';
interface CreateChatPayload {
    id?: string;
    type?: ChatType;
    title?: string;
    members?: {
        type: ChatMemberType;
        userId?: string;
        characterId?: string;
    }[];
}
interface PushMessage {
    id: string;
    role: string;
    content: string;
}
export declare function clampLimit(limit?: number): number;
export declare function resolveSenderId(role: string, userId: string, characterId?: string | null): string | null;
export declare function createChatService(db: Database, metrics?: EngagementMetrics | null, productEventService?: ProductEventService): {
    createChat(userId: string, payload: CreateChatPayload): Promise<{
        id: string;
        type: ChatType;
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getChat(userId: string, chatId: string): Promise<{
        members: {
            id: string;
            userId: string | null;
            characterId: string | null;
            chatId: string;
            memberType: "user" | "character" | "bot";
        }[];
        type: "group" | "private" | "bot" | "channel";
        updatedAt: Date;
        title: string | null;
        id: string;
        createdAt: Date;
        deletedAt: Date | null;
    }>;
    listChats(userId: string): Promise<{
        id: string;
        type: "group" | "private" | "bot" | "channel";
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    updateChat(userId: string, chatId: string, updates: {
        title?: string;
    }): Promise<{
        id: string;
        type: "group" | "private" | "bot" | "channel";
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    deleteChat(userId: string, chatId: string): Promise<{
        id: string;
        type: "group" | "private" | "bot" | "channel";
        title: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    addMember(userId: string, chatId: string, member: {
        type: ChatMemberType;
        userId?: string;
        characterId?: string;
    }): Promise<{
        id: string;
        userId: string | null;
        characterId: string | null;
        chatId: string;
        memberType: "user" | "character" | "bot";
    }>;
    getMembers(chatId: string): Promise<{
        id: string;
        userId: string | null;
        characterId: string | null;
        chatId: string;
        memberType: "user" | "character" | "bot";
    }[]>;
    removeMember(userId: string, chatId: string, memberId: string): Promise<{
        id: string;
        userId: string | null;
        characterId: string | null;
        chatId: string;
        memberType: "user" | "character" | "bot";
    }>;
    pushMessages(userId: string, chatId: string, messages: PushMessage[], characterId?: string): Promise<{
        seq: number;
        fromSeq: number;
        toSeq: number;
    }>;
    /**
     * Soft-delete the user's footprint in chats. Per-chat strategy depends
     * on `chat.type`:
     *
     * - `private` / `bot` (1-on-1, user IS the chat): soft-delete the chat
     *   row + the user's messages. Nothing else can read those messages
     *   (chat is gone), so soft-deleting them is just keeping audit consistent.
     *
     * - `group` / `channel` (shared): drop only this user's `chat_members`
     *   row; the chat + other members survive. The user's messages are
     *   **kept intact** — deleting them would corrupt the conversation
     *   context for remaining members ("B replied to nothing"). Sender
     *   anonymization is automatic: `messages.senderId` is bare text with
     *   no FK, so after better-auth hard-deletes the user row, the senderId
     *   string still groups the user's messages together but cannot be
     *   joined to any PII (name / email are gone with the user row). The
     *   UI is expected to render `senderId` whose user lookup misses as
     *   "Deleted User".
     *
     * `chat_members` rows for shared chats are **hard-deleted** because the
     * table was designed without a `deletedAt` column; auditing who was in
     * which chat is preserved through `messages.senderId` for the messages
     * the user actually authored.
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows on
     * retry; re-deleting an already-removed `chat_members` row is a no-op.
     */
    deleteAllForUser(userId: string): Promise<void>;
    pullMessages(userId: string, chatId: string, afterSeq: number, limit?: number): Promise<{
        messages: WireMessage[];
        seq: number;
    }>;
};
export type ChatService = ReturnType<typeof createChatService>;

