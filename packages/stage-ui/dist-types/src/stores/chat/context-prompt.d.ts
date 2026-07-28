export type { ContextSnapshot } from '@kitsune/core-agent';
export { buildContextPromptMessage, formatContextPromptText } from '@kitsune/core-agent';
/**
 * 构建包含记忆注入的上下文 prompt。
 *
 * 检索流程：
 * 1. 从最近 N 轮对话提取关键词
 * 2. 用关键词检索长期记忆（按 sessionId 过滤）
 * 3. 将检索到的记忆注入 system prompt
 *
 * 由 chat-sync.ts 的流式发送前钩子调用。
 */
export declare function buildContextPromptWithMemory(params: {
    sessionId: string;
    recentMessages: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    searchMemory: (query: string, sessionId: string) => Promise<Array<{
        content: string;
    }>>;
}): Promise<string | null>;
