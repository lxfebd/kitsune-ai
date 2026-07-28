import type { Ref } from 'vue';
interface ChatHistoryScrollOptions<TMessage> {
    /**
     * The scroll container that owns the chat history viewport.
     *
     * Use this when the composable should manage scroll state for a specific
     * `<div>` or similar scrolling element. The element must be the same node
     * that receives the rendered `[data-chat-message-key]` children, because the
     * composable both measures the container and queries message elements inside it.
     *
     * In practice, pass a template ref from the chat history list component:
     *
     * ```ts
     * const chatHistoryRef = ref<HTMLDivElement>()
     *
     * useChatHistoryScroll({
     *   containerRef: chatHistoryRef,
     *   messages,
     *   getKey,
     * })
     * ```
     */
    containerRef: Ref<HTMLDivElement | undefined>;
    /**
     * The ordered chat history currently rendered inside the container.
     *
     * Use this when the message list is reactive and new items or streaming updates
     * can arrive after mount. The composable compares the current tail key with the
     * previous tail key to distinguish between:
     *
     * - a genuinely new tail message
     * - more content being appended to the existing tail message
     *
     * Pass the exact list that the UI renders, including temporary or streaming
     * placeholders if those appear in the chat history surface.
     */
    messages: Ref<TMessage[]>;
    /**
     * Returns the stable rendered identity for a message at a given index.
     *
     * Use this when messages have IDs, timestamps, or another stable identity that
     * matches the DOM node's `data-chat-message-key`. The composable relies on this
     * key for two behaviors:
     *
     * - detecting whether the tail changed between updates
     * - locating the newly inserted tail element to align it into view
     *
     * The returned key should be stable for the lifetime of a rendered message.
     * If the key changes while representing the same message, the composable will
     * treat that as a new tail insertion and may scroll unexpectedly.
     */
    getKey: (message: TMessage, index: number) => string | number;
    /**
     * Optional policy hook for vetoing auto-scroll on new tail insertions.
     *
     * Use this when product behavior needs one more decision layer beyond the
     * composable's built-in intent tracking. For example, a caller might suppress
     * auto-scroll for a certain role, for a synthetic system row, or while a
     * separate overlay is active.
     *
     * This hook is only consulted for genuinely new tail messages. It is not used
     * for initial mount scroll or for streaming follow of the current tail.
     *
     * Return `false` to block the auto-scroll. Any other return value allows it.
     */
    shouldScroll?: (context: {
        reason: 'new-message';
        messageKey: string | number;
        role?: string;
        isFollowingTail: boolean;
        isInspectingHistory: boolean;
    }) => boolean;
}
/**
 * Keeps chat history scrolling aligned with user intent instead of raw message churn.
 *
 * Design purpose:
 *
 * - Show the latest history on first mount, even if the final layout settles a bit later.
 * - Follow a live conversation while the user is still reading at the tail.
 * - Stop automatic movement once the user starts inspecting older history.
 * - Distinguish a newly inserted tail message from streaming growth of the same tail.
 * - Align newly inserted messages to their top edge so long replies start in view.
 *
 * When to use:
 *
 * Use this composable for vertically scrolling chat or timeline surfaces where the
 * latest item normally appears at the bottom and the UI should remain polite about
 * moving the viewport. It is a good fit when messages can arrive from local input,
 * remote sync, IPC, streaming generation, or any other reactive source.
 *
 * How to use:
 *
 * 1. Render the history inside a single scrolling container.
 * 2. Add `data-chat-message-key` to each rendered message wrapper.
 * 3. Pass the container ref, rendered message list, and stable key getter.
 * 4. Optionally provide `shouldScroll` if the caller needs extra veto logic.
 *
 * The composable tracks several signals of user intent, including tail proximity,
 * pointer/focus inspection of older messages, and text selection in history.
 * Automatic follow is preserved only while those signals still indicate that the
 * user wants to stay with the live edge.
 */
export declare function useChatHistoryScroll<TMessage extends {
    role?: string;
}>({ containerRef, messages, getKey, shouldScroll, }: ChatHistoryScrollOptions<TMessage>): {
    isFollowingTail: Readonly<Ref<boolean, boolean>>;
    isInspectingHistory: Readonly<Ref<boolean, boolean>>;
    scrollToBottom: () => void;
};

