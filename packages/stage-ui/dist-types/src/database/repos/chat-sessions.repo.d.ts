import type { ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session';
/**
 * Pending cloud send. Persisted in IDB so a tab close / reload / offline
 * window does not drop messages the user has already typed locally.
 *
 * `cloudChatId` is captured snapshot-style at enqueue time when known;
 * when absent (session not yet reconciled), drain looks it up from the
 * live `sessionMetas` ref and skips the entry until the mapping lands.
 */
export interface ChatSendOutboxEntry {
    /** Stable id matching the local message; reused on every retry so the server can dedup. */
    messageId: string;
    sessionId: string;
    cloudChatId?: string;
    role: 'user' | 'assistant';
    content: string;
    attempts: number;
    lastError?: string;
    queuedAt: number;
}
export declare const chatSessionsRepo: {
    getIndex(userId: string): Promise<ChatSessionsIndex | null>;
    saveIndex(index: ChatSessionsIndex): Promise<void>;
    getSession(sessionId: string): Promise<ChatSessionRecord | null>;
    saveSession(sessionId: string, record: ChatSessionRecord): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    /**
     * Cloud-delete tombstones. When a user deletes a session offline (or before
     * the fire-and-forget DELETE response arrives) the cloud row may still be
     * present on the server's next `listChats`. Without these tombstones the
     * reconcile `adopt` branch would re-import the row and the deleted session
     * would visibly reappear.
     *
     * Stored as a flat array of `cloudChatId`s per user, keyed independently of
     * the index so the data survives index rewrites.
     */
    getTombstones(userId: string): Promise<string[]>;
    addTombstone(userId: string, cloudChatId: string): Promise<void>;
    removeTombstones(userId: string, cloudChatIds: string[]): Promise<void>;
    /**
     * Outbox of message sends pending cloud delivery. Drained on every
     * reconcile + WS-open. Survives tab close / reload — the whole point
     * of the outbox is to never lose a write that landed locally but
     * never made it to the server.
     */
    getOutbox(userId: string): Promise<ChatSendOutboxEntry[]>;
    enqueueOutbox(userId: string, entry: ChatSendOutboxEntry): Promise<void>;
    dequeueOutbox(userId: string, messageIds: string[]): Promise<void>;
    updateOutboxEntries(userId: string, updates: Array<Pick<ChatSendOutboxEntry, "messageId" | "attempts" | "lastError">>): Promise<void>;
    /** Remove every outbox entry for a session. Called when the session is deleted locally. */
    dropOutboxForSession(userId: string, sessionId: string): Promise<void>;
    clear(userId: string): Promise<void>;
};
