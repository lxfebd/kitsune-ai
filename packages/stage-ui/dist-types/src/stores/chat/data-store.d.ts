import type { SystemMessage } from '@xsai/shared-chat';
import type { ChatHistoryItem } from '../../types/chat';
export interface ChatDataAccess {
    getActiveSessionId: () => string;
    setActiveSessionId: (sessionId: string) => void;
    getSessions: () => Record<string, ChatHistoryItem[]>;
    setSessions: (sessions: Record<string, ChatHistoryItem[]>) => void;
    getGenerations: () => Record<string, number>;
    setGenerations: (generations: Record<string, number>) => void;
}
export interface ChatDataStore {
    ensureSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void;
    getSessionMessages: (sessionId: string, createInitialMessage: () => SystemMessage) => ChatHistoryItem[];
    setSessionMessages: (sessionId: string, next: ChatHistoryItem[]) => void;
    setActiveSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void;
    getActiveSessionId: () => string;
    resetSession: (sessionId: string, createInitialMessage: () => SystemMessage) => void;
    refreshSystemMessages: (createInitialMessage: () => SystemMessage) => void;
    replaceSessions: (sessions: Record<string, ChatHistoryItem[]>, createInitialMessage: () => SystemMessage) => void;
    resetAllSessions: (createInitialMessage: () => SystemMessage) => void;
    getAllSessions: () => Record<string, ChatHistoryItem[]>;
    getSessionGeneration: (sessionId: string) => number;
    bumpSessionGeneration: (sessionId: string) => number;
    getSessionGenerationValue: (sessionId?: string) => number;
}
export declare function createChatDataStore(access: ChatDataAccess): ChatDataStore;
