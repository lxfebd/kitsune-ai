import type { ContextIngestResult, ContextMessage } from '@kitsune/core-agent';
export type { ContextHistoryEntry, ContextIngestResult } from '@kitsune/core-agent';
/**
 * UI-facing view of one active context source bucket.
 */
export interface ContextBucketSnapshot {
    /** Stable registry source bucket key. */
    sourceKey: string;
    /** Number of active messages currently stored for this bucket. */
    entryCount: number;
    /** Latest `createdAt` timestamp across messages in this bucket. */
    latestCreatedAt?: number;
    /** Cloned context messages for devtools and UI consumers. */
    messages: ContextMessage[];
}
export declare const useChatContextStore: import("pinia").StoreDefinition<"chat-context", Pick<{
    ingestContextMessage: (envelope: ContextMessage) => ContextIngestResult | undefined;
    resetContexts: () => void;
    getContextsSnapshot: () => Record<string, ContextMessage[]>;
    getContextBucketsSnapshot: () => {
        sourceKey: string;
        entryCount: number;
        latestCreatedAt: number | undefined;
        messages: ContextMessage[];
    }[];
    activeContexts: Readonly<import("vue").Ref<{
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }, {
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }>>;
    contextHistory: Readonly<import("vue").Ref<readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[], readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[]>>;
}, "activeContexts" | "contextHistory">, Pick<{
    ingestContextMessage: (envelope: ContextMessage) => ContextIngestResult | undefined;
    resetContexts: () => void;
    getContextsSnapshot: () => Record<string, ContextMessage[]>;
    getContextBucketsSnapshot: () => {
        sourceKey: string;
        entryCount: number;
        latestCreatedAt: number | undefined;
        messages: ContextMessage[];
    }[];
    activeContexts: Readonly<import("vue").Ref<{
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }, {
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }>>;
    contextHistory: Readonly<import("vue").Ref<readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[], readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[]>>;
}, never>, Pick<{
    ingestContextMessage: (envelope: ContextMessage) => ContextIngestResult | undefined;
    resetContexts: () => void;
    getContextsSnapshot: () => Record<string, ContextMessage[]>;
    getContextBucketsSnapshot: () => {
        sourceKey: string;
        entryCount: number;
        latestCreatedAt: number | undefined;
        messages: ContextMessage[];
    }[];
    activeContexts: Readonly<import("vue").Ref<{
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }, {
        readonly [x: string]: readonly {
            readonly metadata?: {
                readonly source: {
                    readonly id: string;
                    readonly kind: "plugin";
                    readonly plugin: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly extension: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    };
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly ownerExtension?: {
                        readonly id: string;
                        readonly version?: string | undefined;
                        readonly sessionId?: string | undefined;
                        readonly labels?: {
                            readonly [x: string]: string;
                        } | undefined;
                    } | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
            } | undefined;
            readonly createdAt: number;
            readonly id: string;
            readonly contextId: string;
            readonly lane?: string | undefined;
            readonly ideas?: readonly string[] | undefined;
            readonly hints?: readonly string[] | undefined;
            readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
            readonly text: string;
            readonly content?: Readonly<unknown> | undefined;
            readonly destinations?: readonly string[] | {
                readonly all: true;
            } | {
                readonly include?: readonly string[] | undefined;
                readonly exclude?: readonly string[] | undefined;
            } | undefined;
        }[];
    }>>;
    contextHistory: Readonly<import("vue").Ref<readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[], readonly {
        readonly sourceKey: string;
        readonly metadata?: {
            readonly source: {
                readonly id: string;
                readonly kind: "plugin";
                readonly plugin: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly sessionId?: string | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly extension: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                };
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            } | {
                readonly id: string;
                readonly version?: string | undefined;
                readonly ownerExtension?: {
                    readonly id: string;
                    readonly version?: string | undefined;
                    readonly sessionId?: string | undefined;
                    readonly labels?: {
                        readonly [x: string]: string;
                    } | undefined;
                } | undefined;
                readonly labels?: {
                    readonly [x: string]: string;
                } | undefined;
            };
        } | undefined;
        readonly createdAt: number;
        readonly id: string;
        readonly contextId: string;
        readonly lane?: string | undefined;
        readonly ideas?: readonly string[] | undefined;
        readonly hints?: readonly string[] | undefined;
        readonly strategy: import("@kitsune/server-sdk").ContextUpdateStrategy;
        readonly text: string;
        readonly content?: Readonly<unknown> | undefined;
        readonly destinations?: readonly string[] | {
            readonly all: true;
        } | {
            readonly include?: readonly string[] | undefined;
            readonly exclude?: readonly string[] | undefined;
        } | undefined;
    }[]>>;
}, "ingestContextMessage" | "resetContexts" | "getContextsSnapshot" | "getContextBucketsSnapshot">>;
