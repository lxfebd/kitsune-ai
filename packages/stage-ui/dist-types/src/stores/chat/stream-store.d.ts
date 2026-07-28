import type { StreamingAssistantMessage } from '../../types/chat';
export declare const useChatStreamStore: import("pinia").StoreDefinition<"chat-stream", Pick<{
    streamingMessage: import("vue").Ref<{
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }, StreamingAssistantMessage | {
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }>;
    beginStream: () => void;
    appendStreamLiteral: (literal: string) => void;
    finalizeStream: (fullText?: string) => void;
    resetStream: () => void;
}, "streamingMessage">, Pick<{
    streamingMessage: import("vue").Ref<{
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }, StreamingAssistantMessage | {
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }>;
    beginStream: () => void;
    appendStreamLiteral: (literal: string) => void;
    finalizeStream: (fullText?: string) => void;
    resetStream: () => void;
}, never>, Pick<{
    streamingMessage: import("vue").Ref<{
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }, StreamingAssistantMessage | {
        slices: ({
            type: "text";
            text: string;
        } | {
            type: "tool-call";
            toolCall: {
                args: string;
                toolCallId: string;
                toolCallType: "function";
                toolName: string;
            };
        } | {
            type: "tool-call-result";
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        })[];
        tool_results: {
            id: string;
            isError?: boolean | undefined;
            result?: string | ({
                text: string;
                type: "text";
            } | {
                input_audio: {
                    data: string;
                    format: "mp3" | "wav";
                };
                type: "input_audio";
            } | {
                file: {
                    file_data?: string | undefined;
                    file_id?: string | undefined;
                    filename?: string | undefined;
                };
                type: "file";
            } | {
                image_url: {
                    detail?: "auto" | "high" | "low" | undefined;
                    url: string;
                };
                type: "image_url";
            })[] | undefined;
        }[];
        categorization?: {
            speech: string;
            reasoning: string;
        } | undefined;
        content?: string | ({
            text: string;
            type: "text";
        } | {
            refusal: string;
            type: "refusal";
        })[] | undefined;
        name?: string | undefined;
        reasoning?: string | undefined;
        reasoning_content?: string | undefined;
        refusal?: string | undefined;
        role: "assistant";
        tool_calls?: {
            function: {
                arguments: string;
                name: string;
            } | {
                arguments?: never | undefined;
                name: string;
            } | {
                arguments: string;
                name?: never | undefined;
            };
            id: string;
            type: "function";
        }[] | undefined;
        context?: {
            metadata?: {
                source: {
                    id: string;
                    kind: "plugin";
                    plugin: {
                        id: string;
                        version?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    sessionId?: string | undefined;
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    extension: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    };
                    labels?: Record<string, string> | undefined;
                } | {
                    id: string;
                    version?: string | undefined;
                    ownerExtension?: {
                        id: string;
                        version?: string | undefined;
                        sessionId?: string | undefined;
                        labels?: Record<string, string> | undefined;
                    } | undefined;
                    labels?: Record<string, string> | undefined;
                };
            } | undefined;
            createdAt: number;
            id: string;
            contextId: string;
            lane?: string | undefined;
            ideas?: Array<string> | undefined;
            hints?: Array<string> | undefined;
            strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            text: string;
            content?: unknown;
            destinations?: string[] | {
                all: true;
            } | {
                include?: Array<string> | undefined;
                exclude?: Array<string> | undefined;
            } | undefined;
        } | undefined;
        createdAt?: number | undefined;
        id?: string | undefined;
    }>;
    beginStream: () => void;
    appendStreamLiteral: (literal: string) => void;
    finalizeStream: (fullText?: string) => void;
    resetStream: () => void;
}, "beginStream" | "appendStreamLiteral" | "finalizeStream" | "resetStream">>;
