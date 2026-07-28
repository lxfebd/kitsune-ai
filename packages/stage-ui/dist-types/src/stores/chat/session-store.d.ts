import type { ChatHistoryItem } from '../../types/chat';
import type { ChatSessionMeta, ChatSessionsExport, ChatSessionsIndex } from '../../types/chat-session';
export declare const useChatSessionStore: import("pinia").StoreDefinition<"chat-session", Pick<{
    ready: import("vue").Ref<boolean, boolean>;
    isReady: import("vue").ComputedRef<boolean>;
    initialize: () => Promise<void>;
    activeSessionId: import("vue").Ref<string, string>;
    messages: import("vue").WritableComputedRef<ChatHistoryItem[], ChatHistoryItem[]>;
    setActiveSession: (sessionId: string) => void;
    applyRemoteSnapshot: (snapshot: {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index?: ChatSessionsIndex | null;
    }) => void;
    getSnapshot: () => {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index: {
            userId: string;
            characters: Record<string, import("../../types/chat-session").ChatCharacterSessionsIndex>;
        } | null;
    };
    cleanupMessages: (sessionId?: string) => void;
    getAllSessions: () => Record<string, ChatHistoryItem[]>;
    resetAllSessions: () => Promise<void>;
    ensureSession: (sessionId: string) => void;
    setSessionMessages: (sessionId: string, next: ChatHistoryItem[]) => void;
    appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void;
    persistSessionMessages: (sessionId: string) => void;
    getSessionMessages: (sessionId: string) => ChatHistoryItem[];
    sessionMessages: import("vue").Ref<Record<string, ChatHistoryItem[]>, Record<string, ChatHistoryItem[]>>;
    sessionMetas: import("vue").Ref<Record<string, ChatSessionMeta>, Record<string, ChatSessionMeta>>;
    getSessionGeneration: (sessionId: string) => number;
    bumpSessionGeneration: (sessionId: string) => number;
    getSessionGenerationValue: (sessionId?: string) => number;
    forkSession: (options: {
        fromSessionId: string;
        atIndex?: number;
        reason?: string;
        hidden?: boolean;
    }) => Promise<string>;
    exportSessions: () => Promise<ChatSessionsExport>;
    importSessions: (payload: ChatSessionsExport) => Promise<void>;
    createSession: (characterId: string, options?: {
        setActive?: boolean;
        messages?: ChatHistoryItem[];
        title?: string;
    }) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
}, "ready" | "activeSessionId" | "sessionMessages" | "sessionMetas">, Pick<{
    ready: import("vue").Ref<boolean, boolean>;
    isReady: import("vue").ComputedRef<boolean>;
    initialize: () => Promise<void>;
    activeSessionId: import("vue").Ref<string, string>;
    messages: import("vue").WritableComputedRef<ChatHistoryItem[], ChatHistoryItem[]>;
    setActiveSession: (sessionId: string) => void;
    applyRemoteSnapshot: (snapshot: {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index?: ChatSessionsIndex | null;
    }) => void;
    getSnapshot: () => {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index: {
            userId: string;
            characters: Record<string, import("../../types/chat-session").ChatCharacterSessionsIndex>;
        } | null;
    };
    cleanupMessages: (sessionId?: string) => void;
    getAllSessions: () => Record<string, ChatHistoryItem[]>;
    resetAllSessions: () => Promise<void>;
    ensureSession: (sessionId: string) => void;
    setSessionMessages: (sessionId: string, next: ChatHistoryItem[]) => void;
    appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void;
    persistSessionMessages: (sessionId: string) => void;
    getSessionMessages: (sessionId: string) => ChatHistoryItem[];
    sessionMessages: import("vue").Ref<Record<string, ChatHistoryItem[]>, Record<string, ChatHistoryItem[]>>;
    sessionMetas: import("vue").Ref<Record<string, ChatSessionMeta>, Record<string, ChatSessionMeta>>;
    getSessionGeneration: (sessionId: string) => number;
    bumpSessionGeneration: (sessionId: string) => number;
    getSessionGenerationValue: (sessionId?: string) => number;
    forkSession: (options: {
        fromSessionId: string;
        atIndex?: number;
        reason?: string;
        hidden?: boolean;
    }) => Promise<string>;
    exportSessions: () => Promise<ChatSessionsExport>;
    importSessions: (payload: ChatSessionsExport) => Promise<void>;
    createSession: (characterId: string, options?: {
        setActive?: boolean;
        messages?: ChatHistoryItem[];
        title?: string;
    }) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
}, "isReady" | "messages">, Pick<{
    ready: import("vue").Ref<boolean, boolean>;
    isReady: import("vue").ComputedRef<boolean>;
    initialize: () => Promise<void>;
    activeSessionId: import("vue").Ref<string, string>;
    messages: import("vue").WritableComputedRef<ChatHistoryItem[], ChatHistoryItem[]>;
    setActiveSession: (sessionId: string) => void;
    applyRemoteSnapshot: (snapshot: {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index?: ChatSessionsIndex | null;
    }) => void;
    getSnapshot: () => {
        activeSessionId: string;
        sessionMessages: Record<string, ChatHistoryItem[]>;
        sessionMetas: Record<string, ChatSessionMeta>;
        index: {
            userId: string;
            characters: Record<string, import("../../types/chat-session").ChatCharacterSessionsIndex>;
        } | null;
    };
    cleanupMessages: (sessionId?: string) => void;
    getAllSessions: () => Record<string, ChatHistoryItem[]>;
    resetAllSessions: () => Promise<void>;
    ensureSession: (sessionId: string) => void;
    setSessionMessages: (sessionId: string, next: ChatHistoryItem[]) => void;
    appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void;
    persistSessionMessages: (sessionId: string) => void;
    getSessionMessages: (sessionId: string) => ChatHistoryItem[];
    sessionMessages: import("vue").Ref<Record<string, ChatHistoryItem[]>, Record<string, ChatHistoryItem[]>>;
    sessionMetas: import("vue").Ref<Record<string, ChatSessionMeta>, Record<string, ChatSessionMeta>>;
    getSessionGeneration: (sessionId: string) => number;
    bumpSessionGeneration: (sessionId: string) => number;
    getSessionGenerationValue: (sessionId?: string) => number;
    forkSession: (options: {
        fromSessionId: string;
        atIndex?: number;
        reason?: string;
        hidden?: boolean;
    }) => Promise<string>;
    exportSessions: () => Promise<ChatSessionsExport>;
    importSessions: (payload: ChatSessionsExport) => Promise<void>;
    createSession: (characterId: string, options?: {
        setActive?: boolean;
        messages?: ChatHistoryItem[];
        title?: string;
    }) => Promise<string>;
    loadSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
}, "initialize" | "setActiveSession" | "applyRemoteSnapshot" | "getSnapshot" | "cleanupMessages" | "getAllSessions" | "resetAllSessions" | "ensureSession" | "setSessionMessages" | "appendSessionMessage" | "persistSessionMessages" | "getSessionMessages" | "getSessionGeneration" | "bumpSessionGeneration" | "getSessionGenerationValue" | "forkSession" | "exportSessions" | "importSessions" | "createSession" | "loadSession" | "deleteSession">>;
