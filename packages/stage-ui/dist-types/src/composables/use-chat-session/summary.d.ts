import type { ChatHistoryItem } from '../../types/chat';
/**
 * Extract all reasoning from a session's messages
 */
export declare function getAllReasoning(messages: ChatHistoryItem[]): string[];
/**
 * Get combined reasoning as a single string
 */
export declare function getCombinedReasoning(messages: ChatHistoryItem[]): string;
/**
 * Get session summary with reasoning, speech, and metadata
 */
export declare function getSessionSummary(sessionId: string, messages: ChatHistoryItem[]): {
    sessionId: string;
    messageCount: number;
    reasoningCount: number;
    allReasoning: string[];
    allSpeech: string[];
    combinedReasoning: string;
    combinedSpeech: string;
    createdAt?: number;
    lastMessageAt?: number;
};
/**
 * Get reasoning from all sessions
 */
export declare function getAllReasoningFromAllSessions(allSessions: Record<string, ChatHistoryItem[]>): string[];
