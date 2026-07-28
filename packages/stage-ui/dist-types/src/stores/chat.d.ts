import type { ChatOrchestratorSendOptions } from '@kitsune/core-agent';
interface ForkOptions {
    fromSessionId?: string;
    atIndex?: number;
    reason?: string;
    hidden?: boolean;
}
export type { QueuedSendSnapshot, ChatOrchestratorSendOptions as SendOptions } from '@kitsune/core-agent';
export declare const useChatOrchestratorStore: import("pinia").StoreDefinition<"chat-orchestrator", Pick<{
    setCachedPersonaPrompt(prompt: string, sessionId: string): void;
    /** 检查 persona 缓存是否对指定 session 仍有效（60s TTL） */
    isPersonaCacheValid(sessionId: string): boolean;
    sending: import("vue").Ref<boolean, boolean>;
    pendingQueuedSendCount: import("vue").Ref<number, number>;
    ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<void>;
    ingestOnFork: (sendingMessage: string, options: ChatOrchestratorSendOptions, forkOptions?: ForkOptions) => Promise<void>;
    cancelPendingSends: (sessionId?: string) => void;
    getPendingQueuedSendSnapshot: () => import("@kitsune/core-agent").QueuedSendSnapshot[];
    clearHooks: () => void;
    emitBeforeMessageComposedHooks: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>;
    emitAfterMessageComposedHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitBeforeSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAfterSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenLiteralHooks: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenSpecialHooks: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitStreamEndHooks: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantResponseEndHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantMessageHooks: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitChatTurnCompleteHooks: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    onBeforeMessageComposed: (cb: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>) => () => void;
    onAfterMessageComposed: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onBeforeSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAfterSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenLiteral: (cb: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenSpecial: (cb: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onStreamEnd: (cb: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantResponseEnd: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantMessage: (cb: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onChatTurnComplete: (cb: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
}, "sending" | "pendingQueuedSendCount">, Pick<{
    setCachedPersonaPrompt(prompt: string, sessionId: string): void;
    /** 检查 persona 缓存是否对指定 session 仍有效（60s TTL） */
    isPersonaCacheValid(sessionId: string): boolean;
    sending: import("vue").Ref<boolean, boolean>;
    pendingQueuedSendCount: import("vue").Ref<number, number>;
    ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<void>;
    ingestOnFork: (sendingMessage: string, options: ChatOrchestratorSendOptions, forkOptions?: ForkOptions) => Promise<void>;
    cancelPendingSends: (sessionId?: string) => void;
    getPendingQueuedSendSnapshot: () => import("@kitsune/core-agent").QueuedSendSnapshot[];
    clearHooks: () => void;
    emitBeforeMessageComposedHooks: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>;
    emitAfterMessageComposedHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitBeforeSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAfterSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenLiteralHooks: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenSpecialHooks: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitStreamEndHooks: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantResponseEndHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantMessageHooks: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitChatTurnCompleteHooks: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    onBeforeMessageComposed: (cb: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>) => () => void;
    onAfterMessageComposed: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onBeforeSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAfterSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenLiteral: (cb: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenSpecial: (cb: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onStreamEnd: (cb: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantResponseEnd: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantMessage: (cb: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onChatTurnComplete: (cb: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
}, never>, Pick<{
    setCachedPersonaPrompt(prompt: string, sessionId: string): void;
    /** 检查 persona 缓存是否对指定 session 仍有效（60s TTL） */
    isPersonaCacheValid(sessionId: string): boolean;
    sending: import("vue").Ref<boolean, boolean>;
    pendingQueuedSendCount: import("vue").Ref<number, number>;
    ingest: (sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) => Promise<void>;
    ingestOnFork: (sendingMessage: string, options: ChatOrchestratorSendOptions, forkOptions?: ForkOptions) => Promise<void>;
    cancelPendingSends: (sessionId?: string) => void;
    getPendingQueuedSendSnapshot: () => import("@kitsune/core-agent").QueuedSendSnapshot[];
    clearHooks: () => void;
    emitBeforeMessageComposedHooks: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>;
    emitAfterMessageComposedHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitBeforeSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAfterSendHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenLiteralHooks: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitTokenSpecialHooks: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitStreamEndHooks: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantResponseEndHooks: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitAssistantMessageHooks: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    emitChatTurnCompleteHooks: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>;
    onBeforeMessageComposed: (cb: (message: string, context: Omit<import("@kitsune/core-agent").ChatStreamEventContext, "composedMessage">) => Promise<void>) => () => void;
    onAfterMessageComposed: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onBeforeSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAfterSend: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenLiteral: (cb: (literal: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onTokenSpecial: (cb: (special: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onStreamEnd: (cb: (context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantResponseEnd: (cb: (message: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onAssistantMessage: (cb: (message: import("@kitsune/core-agent").StreamingAssistantMessage, messageText: string, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
    onChatTurnComplete: (cb: (chat: {
        output: import("@kitsune/core-agent").StreamingAssistantMessage;
        outputText: string;
        toolCalls: import("@xsai/shared-chat").ToolMessage[];
    }, context: import("@kitsune/core-agent").ChatStreamEventContext) => Promise<void>) => () => void;
}, "setCachedPersonaPrompt" | "isPersonaCacheValid" | "ingest" | "ingestOnFork" | "cancelPendingSends" | "getPendingQueuedSendSnapshot" | "clearHooks" | "emitBeforeMessageComposedHooks" | "emitAfterMessageComposedHooks" | "emitBeforeSendHooks" | "emitAfterSendHooks" | "emitTokenLiteralHooks" | "emitTokenSpecialHooks" | "emitStreamEndHooks" | "emitAssistantResponseEndHooks" | "emitAssistantMessageHooks" | "emitChatTurnCompleteHooks" | "onBeforeMessageComposed" | "onAfterMessageComposed" | "onBeforeSend" | "onAfterSend" | "onTokenLiteral" | "onTokenSpecial" | "onStreamEnd" | "onAssistantResponseEnd" | "onAssistantMessage" | "onChatTurnComplete">>;
