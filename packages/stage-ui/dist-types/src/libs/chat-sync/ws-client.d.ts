import type { NewMessagesPayload, PullMessagesRequest, PullMessagesResponse, SendMessagesRequest, SendMessagesResponse } from '@kitsune/server-sdk-shared';
import type { ComputedRef, Ref } from 'vue';
/**
 * Server-side auth rejection close code (IANA application range 4000-4999).
 *
 * Browsers swallow the HTTP 401 status when a WebSocket upgrade is rejected,
 * so the only way for the server to distinguish "wrong token, stop retrying"
 * from a transient network drop on the client is to accept the upgrade and
 * close with a custom application code. The server emits this from
 * `apps/server/src/app.ts` when `resolveRequestAuth` returns null.
 */
export declare const WS_CLOSE_UNAUTHORIZED = 4001;
/**
 * WebSocket connection lifecycle states surfaced to the chat-sync layer.
 *
 * - `idle`: never connected, or `disconnect()` was called and we are not
 *   trying to reconnect.
 * - `connecting`: WebSocket handshake in flight (initial or reconnect attempt).
 * - `open`: socket open and `wsConnectedEvent` fired.
 * - `closed`: lost the socket; auto-reconnect may bring it back to `connecting`.
 */
export type ChatWsStatus = 'idle' | 'connecting' | 'open' | 'closed';
/**
 * Disposer returned by `onNewMessages` / `onStatusChange`. Calling it removes
 * the listener; safe to call multiple times.
 */
export type ChatWsUnsubscribe = () => void;
export interface CreateChatWsClientOptions {
    /**
     * Base server URL, e.g. `https://api.airi.build`. The client appends
     * `/ws/chat?token=<jwt>` to build the WebSocket URL.
     */
    serverUrl: string;
    /**
     * Resolves the current bearer token at connect/reconnect time. Returning
     * `null` skips connecting (the user is not authenticated).
     */
    getToken: () => string | null;
}
export interface ChatWsClient {
    /** Current connection status. Useful for UI banners. */
    status: () => ChatWsStatus;
    /** Connect (or reconnect with the latest token). No-op if already open. */
    connect: () => void;
    /** Close the socket and stop auto-reconnect until the next `connect()`. The handle is reusable. */
    disconnect: () => void;
    /** Permanently dispose the client (stops the status watcher). After `destroy()` the handle is unusable. */
    destroy: () => void;
    /** RPC: push messages to a chat. Rejects if disconnected mid-flight. */
    sendMessages: (req: SendMessagesRequest) => Promise<SendMessagesResponse>;
    /** RPC: pull messages newer than `afterSeq`. Rejects if disconnected mid-flight. */
    pullMessages: (req: PullMessagesRequest) => Promise<PullMessagesResponse>;
    /**
     * Subscribe to inbound `newMessages` push. The handler fires for every
     * authenticated push, including potential echoes of the local sender — the
     * caller MUST dedup by message id.
     */
    onNewMessages: (handler: (payload: NewMessagesPayload) => void) => ChatWsUnsubscribe;
    /** Subscribe to status transitions for UI / catchup orchestration. */
    onStatusChange: (handler: (status: ChatWsStatus) => void) => ChatWsUnsubscribe;
}
/**
 * Build the `/ws/chat?token=<jwt>` URL from a base server URL.
 *
 * Before:
 * - "https://api.airi.build", token="abc"
 *
 * After:
 * - "wss://api.airi.build/ws/chat?token=abc"
 *
 * @internal
 */
export declare function buildChatWsUrl(serverUrl: string, token: string): string;
/**
 * Compute exponential reconnect delay with bounded jitter.
 *
 * Math context: VueUse's autoReconnect supplies `retries` starting at 1 for
 * the first reconnect. The minimum 50% floor keeps the immediate retry from
 * firing in <50ms (a 0..exp uniform jitter previously could fire at ~0ms,
 * producing reconnect storms across many tabs against a hard-down server).
 *
 * @internal
 */
export declare function computeReconnectDelay(retries: number, baseMs: number, maxMs: number): number;
/**
 * Map VueUse's 3-state status onto the chat-sync 4-state machine.
 *
 * VueUse exposes `OPEN | CONNECTING | CLOSED`. Chat-sync needs to distinguish
 * "never connected / explicitly disconnected" (`idle`) from "lost the socket
 * and auto-reconnect is pending" (`closed`). The caller tracks the user
 * intent via `enabled`; here we just translate the transport state.
 *
 * @internal
 */
export declare function mapStatus(vue: 'OPEN' | 'CONNECTING' | 'CLOSED', enabled: boolean): ChatWsStatus;
/**
 * Create a chat-sync WebSocket client backed by VueUse's `useWebSocket` plus
 * eventa's native ws adapter for the eventa context that handles RPC and
 * outbound subscription routing.
 *
 * Use when:
 * - The user is signed in and the chat store wants real-time sync.
 *
 * Expects:
 * - `serverUrl` includes scheme (https/http). Token must be a valid JWT;
 *   401s during the WebSocket upgrade close the socket immediately and the
 *   auto-reconnect loop will keep retrying with whatever `getToken()`
 *   returns next.
 *
 * Returns:
 * - A handle exposing connect/disconnect/destroy, RPC functions, and event
 *   hooks. RPC closures resolve the live `EventContext` per invocation so a
 *   reconnect-induced context swap is transparent. In-flight RPCs reject on
 *   disconnect with `chat-ws: rpc cancelled` so callers do not hang
 *   indefinitely (eventa@0.3.0 does not flush its internal pending maps when
 *   the underlying context is disposed; we wrap each invoke in a race).
 */
/**
 * Build the reactive ws URL ref `useWebSocket` watches.
 *
 * `getToken` MUST read from a reactive source (Pinia store ref, Vue ref,
 * computed). A non-reactive read (e.g. `localStorage.getItem`) freezes the
 * URL at first evaluation and `useWebSocket` will reconnect forever with
 * the stale token after the next OIDC refresh — verified by
 * `freezes ws URL when getToken is non-reactive` in ws-client.test.ts.
 */
export declare function createChatWsUrlRef(enabled: Ref<boolean>, getToken: () => string | null, serverUrl: string): ComputedRef<string | undefined>;
export declare function createChatWsClient(options: CreateChatWsClientOptions): ChatWsClient;
