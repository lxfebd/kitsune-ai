import type { ChatSessionMeta } from '../../types/chat-session';
import * as v from 'valibot';
declare const RemoteChatSchema: v.ObjectSchema<{
    readonly id: v.SchemaWithPipe<readonly [v.StringSchema<undefined>, v.MinLengthAction<string, 1, undefined>]>;
    readonly type: v.PicklistSchema<readonly ["private", "bot", "group", "channel"], undefined>;
    readonly title: v.NullableSchema<v.StringSchema<undefined>, undefined>;
    readonly createdAt: v.StringSchema<undefined>;
    readonly updatedAt: v.StringSchema<undefined>;
}, undefined>;
/** Minimal shape of a chat returned by `GET /api/v1/chats`. */
export type RemoteChat = v.InferOutput<typeof RemoteChatSchema>;
export interface CreateRemoteChatInput {
    id?: string;
    type?: 'private' | 'bot' | 'group' | 'channel';
    title?: string;
    members?: Array<{
        type: 'user' | 'character' | 'bot';
        userId?: string;
        characterId?: string;
    }>;
}
export interface CreateCloudChatMapperOptions {
    /** Base server URL, e.g. `https://api.airi.build`. */
    serverUrl: string;
    /**
     * Fetch implementation. Production callers MUST pass `authedFetch` from
     * `libs/auth-fetch` so 401 responses trigger the single-flight token
     * refresh + retry — matching every other REST surface in stage-ui.
     * The default is the bare `globalThis.fetch` so tests in non-DOM
     * environments (Node) don't pull `auth-fetch` (which transitively reads
     * `window.location`).
     *
     * @default globalThis.fetch
     */
    fetch?: typeof fetch;
    /**
     * Per-request timeout in ms. A hung `listChats` would otherwise hold the
     * reconcile reentrance guard forever (`cloudReconcileTask` never settles).
     *
     * @default 10_000
     */
    requestTimeoutMs?: number;
}
export interface CloudChatMapper {
    /** GET /api/v1/chats — returns the full list for the current user. */
    listChats: () => Promise<RemoteChat[]>;
    /**
     * POST /api/v1/chats — server may auto-generate id if not provided. A
     * 409 Conflict (id already exists) is treated as an idempotent claim and
     * the existing remote chat is returned.
     */
    createChat: (input: CreateRemoteChatInput) => Promise<RemoteChat>;
    /**
     * DELETE /api/v1/chats/:id — server soft-deletes the chat. Other devices
     * stop seeing it on next `listChats`; live ones won't get a push event in
     * v1 (no chat:deleted broadcast yet) but their local mapping persists
     * harmlessly until the user manually closes that session.
     */
    deleteChat: (chatId: string) => Promise<void>;
}
/**
 * Build a thin REST client over `/api/v1/chats` for cloud reconcile use cases.
 *
 * Use when:
 * - The session store needs to mirror local sessions to the server `chats`
 *   table (initial reconcile, creating cloud chats for new local sessions).
 *
 * Expects:
 * - Auth is handled by `authedFetch` (the default `fetch` implementation),
 *   which reads `getAuthToken()` directly and refreshes on 401. 401 responses
 *   that survive the refresh cycle surface as `Error('HTTP 401: ...')`.
 *
 * Returns:
 * - A handle exposing `listChats`, `createChat` (with idempotent 409
 *   handling), and `deleteChat`. All throw on non-2xx outside the documented
 *   idempotency window.
 */
export declare function createCloudChatMapper(options: CreateCloudChatMapperOptions): CloudChatMapper;
/**
 * Result of a reconcile decision over local sessions and remote chats.
 *
 * Outcomes per session:
 * - `claim`: local session has no `cloudChatId`, but a remote chat with the
 *   same id (we adopted that convention when creating sessions before) or
 *   matching membership exists; bind to it.
 * - `create`: local session has no `cloudChatId` and no remote match; need to
 *   POST `/api/v1/chats` to mint a chat for it.
 * - `adopt`: remote chat exists with no local session at all; need to create
 *   a local session shell so future `pullMessages` can populate it.
 */
export interface ReconcilePlan {
    claim: Array<{
        sessionId: string;
        cloudChatId: string;
    }>;
    create: Array<{
        sessionId: string;
        characterId: string;
    }>;
    adopt: RemoteChat[];
}
/**
 * Pure reconcile decision over local sessions and remote chats.
 *
 * Use when:
 * - Login completes and the session-store wants a single deterministic plan
 *   instead of interleaving REST calls with mutations.
 *
 * Expects:
 * - `localSessions` is the full list of meta records owned by the current
 *   user. Sessions whose `userId` is `'local'` (anonymous) MUST be filtered
 *   out by the caller before reconcile — they are not cloud-eligible.
 *
 * Returns:
 * - A plan of three lists. The caller applies them in any order; `create`
 *   actions need the network, `claim` / `adopt` are pure store mutations.
 */
export declare function reconcileLocalAndRemote(localSessions: ChatSessionMeta[], remoteChats: RemoteChat[]): ReconcilePlan;
/**
 * Run `createChat` for every entry in the plan in parallel, collecting
 * successes and failures. Failures do not abort the run — the caller decides
 * whether to retry next time.
 *
 * Use when:
 * - Applying a `ReconcilePlan.create` list against the network. The v1
 *   workload (a few sessions queued from offline use) is small enough that
 *   `Promise.all` is fine; a hand-rolled bounded pool would be premature.
 *
 * Expects:
 * - `mapper.createChat` handles its own 409-as-claim idempotency, so this
 *   function can treat each result as either success or terminal failure.
 *
 * Returns:
 * - One result entry per input action, in input order. Each entry has either
 *   `cloudChatId` (success) or `error` (failure with message). Never both.
 */
export declare function applyCreateActions(mapper: CloudChatMapper, actions: ReconcilePlan['create']): Promise<Array<{
    sessionId: string;
    cloudChatId?: string;
    error?: string;
}>>;

