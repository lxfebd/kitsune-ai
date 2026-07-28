import type Redis from 'ioredis';
import type { InferOutput } from 'valibot';
/**
 * LLM/TTS router config tree. Single composite entry under configKV holds the
 * entire routing surface: per-model upstream list, per-upstream key array
 * (envelope-encrypted ciphertexts), fallback triggers, default timeouts.
 *
 * Schema enforces:
 * - key entry id must not contain `|` — the envelope-crypto AAD uses `|` as
 *   a reserved separator between `modelName` and `keyEntryId`.
 * - keys array is non-empty per upstream (an upstream with zero keys can
 *   never serve a request and is almost certainly an admin mistake).
 *
 * Defaults at this layer apply when the admin omits the `defaults` object;
 * the router service is responsible for surfacing CONFIG_NOT_SET when the
 * whole `LLM_ROUTER_CONFIG` entry is absent.
 */
export declare const fallbackTriggersSchema: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
    readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
    readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
}, undefined>, {
    readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
    readonly onTimeout: true;
}>;
export declare const keyEntrySchema: import("valibot").ObjectSchema<{
    readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
    readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
}, undefined>;
export declare const llmUpstreamSchema: import("valibot").ObjectSchema<{
    readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "llm.upstreams[].baseURL must not be empty">]>;
    readonly overrideModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        id: string;
        ciphertext: string;
    }[], "llm.upstreams[].keys must contain at least 1 entry">]>;
    readonly headerTemplate: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "Bearer {KEY}">;
    readonly timeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, undefined>;
}, undefined>;
export declare const llmModelSchema: import("valibot").ObjectSchema<{
    readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "llm.upstreams[].baseURL must not be empty">]>;
        readonly overrideModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
            readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
            readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
        }, undefined>, undefined>, import("valibot").CheckAction<{
            id: string;
            ciphertext: string;
        }[], "llm.upstreams[].keys must contain at least 1 entry">]>;
        readonly headerTemplate: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "Bearer {KEY}">;
        readonly timeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, undefined>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        baseURL: string;
        overrideModel?: string | undefined;
        keys: {
            id: string;
            ciphertext: string;
        }[];
        headerTemplate: string;
        timeoutMs?: number | undefined;
    }[], "llm.models[].upstreams must contain at least 1 entry">]>;
    readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
        readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
    }, undefined>, {
        readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
        readonly onTimeout: true;
    }>;
}, undefined>;
export declare const ttsUpstreamSchema: import("valibot").ObjectSchema<{
    readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "tts.upstreams[].baseURL must not be empty">]>;
    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        id: string;
        ciphertext: string;
    }[], "tts.upstreams[].keys must contain at least 1 entry">]>;
    readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
    readonly maxConcurrency: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").CheckAction<number, "tts.upstreams[].maxConcurrency must be >= 1 when set">]>, undefined>;
}, undefined>;
export declare const streamingTtsUpstreamSchema: import("valibot").ObjectSchema<{
    readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.baseURL must not be empty">]>;
    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        id: string;
        ciphertext: string;
    }[], "UNSPEECH_UPSTREAM.streaming.keys must contain at least 1 entry">]>;
    readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
    readonly models: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.models[].id must not be empty">]>;
        readonly name: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        readonly description: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>, readonly []>;
    readonly defaultModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
}, undefined>;
export declare const unspeechUpstreamSchema: import("valibot").ObjectSchema<{
    readonly restBaseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.restBaseURL must not be empty">]>;
    readonly streaming: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.baseURL must not be empty">]>;
        readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
            readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
            readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
        }, undefined>, undefined>, import("valibot").CheckAction<{
            id: string;
            ciphertext: string;
        }[], "UNSPEECH_UPSTREAM.streaming.keys must contain at least 1 entry">]>;
        readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
        readonly models: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
            readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.models[].id must not be empty">]>;
            readonly name: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
            readonly description: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        }, undefined>, undefined>, readonly []>;
        readonly defaultModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    }, undefined>, undefined>;
}, undefined>;
export declare const ttsModelSchema: import("valibot").ObjectSchema<{
    readonly provider: import("valibot").PicklistSchema<["azure", "dashscope-cosyvoice", "stepfun", "volcengine"], undefined>;
    readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "tts.upstreams[].baseURL must not be empty">]>;
        readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
            readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
            readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
        }, undefined>, undefined>, import("valibot").CheckAction<{
            id: string;
            ciphertext: string;
        }[], "tts.upstreams[].keys must contain at least 1 entry">]>;
        readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
        readonly maxConcurrency: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").CheckAction<number, "tts.upstreams[].maxConcurrency must be >= 1 when set">]>, undefined>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        baseURL: string;
        keys: {
            id: string;
            ciphertext: string;
        }[];
        adapterParams: {
            [x: string]: any;
        };
        maxConcurrency?: number | undefined;
    }[], "tts.models[].upstreams must contain at least 1 entry">]>;
    readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
        readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
    }, undefined>, {
        readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
        readonly onTimeout: true;
    }>;
}, undefined>;
export declare const asrUpstreamSchema: import("valibot").ObjectSchema<{
    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        id: string;
        ciphertext: string;
    }[], "asr.upstreams[].keys must contain at least 1 entry">]>;
    readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
}, undefined>;
export declare const asrModelSchema: import("valibot").ObjectSchema<{
    readonly provider: import("valibot").PicklistSchema<["aliyun-nls"], undefined>;
    readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
        readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
            readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
            readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
        }, undefined>, undefined>, import("valibot").CheckAction<{
            id: string;
            ciphertext: string;
        }[], "asr.upstreams[].keys must contain at least 1 entry">]>;
        readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
    }, undefined>, undefined>, import("valibot").CheckAction<{
        keys: {
            id: string;
            ciphertext: string;
        }[];
        adapterParams: {
            [x: string]: any;
        };
    }[], "asr.models[].upstreams must contain at least 1 entry">]>;
}, undefined>;
export declare const llmRouterDefaultsSchema: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
    readonly perAttemptTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 30000>;
    readonly fullChainTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 60000>;
    readonly fallbackHttpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
}, undefined>, {
    readonly perAttemptTimeoutMs: 30000;
    readonly fullChainTimeoutMs: 60000;
    readonly fallbackHttpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
}>;
export declare const llmRouterConfigSchema: import("valibot").ObjectSchema<{
    readonly llm: import("valibot").ObjectSchema<{
        readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
            readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "llm.upstreams[].baseURL must not be empty">]>;
                readonly overrideModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
                readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                    readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    id: string;
                    ciphertext: string;
                }[], "llm.upstreams[].keys must contain at least 1 entry">]>;
                readonly headerTemplate: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "Bearer {KEY}">;
                readonly timeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, undefined>;
            }, undefined>, undefined>, import("valibot").CheckAction<{
                baseURL: string;
                overrideModel?: string | undefined;
                keys: {
                    id: string;
                    ciphertext: string;
                }[];
                headerTemplate: string;
                timeoutMs?: number | undefined;
            }[], "llm.models[].upstreams must contain at least 1 entry">]>;
            readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
                readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
            }, undefined>, {
                readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
                readonly onTimeout: true;
            }>;
        }, undefined>, undefined>;
    }, undefined>;
    readonly tts: import("valibot").ObjectSchema<{
        readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
            readonly provider: import("valibot").PicklistSchema<["azure", "dashscope-cosyvoice", "stepfun", "volcengine"], undefined>;
            readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "tts.upstreams[].baseURL must not be empty">]>;
                readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                    readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    id: string;
                    ciphertext: string;
                }[], "tts.upstreams[].keys must contain at least 1 entry">]>;
                readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
                readonly maxConcurrency: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").CheckAction<number, "tts.upstreams[].maxConcurrency must be >= 1 when set">]>, undefined>;
            }, undefined>, undefined>, import("valibot").CheckAction<{
                baseURL: string;
                keys: {
                    id: string;
                    ciphertext: string;
                }[];
                adapterParams: {
                    [x: string]: any;
                };
                maxConcurrency?: number | undefined;
            }[], "tts.models[].upstreams must contain at least 1 entry">]>;
            readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
                readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
            }, undefined>, {
                readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
                readonly onTimeout: true;
            }>;
        }, undefined>, undefined>;
    }, undefined>;
    readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
            readonly provider: import("valibot").PicklistSchema<["aliyun-nls"], undefined>;
            readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                    readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    id: string;
                    ciphertext: string;
                }[], "asr.upstreams[].keys must contain at least 1 entry">]>;
                readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
            }, undefined>, undefined>, import("valibot").CheckAction<{
                keys: {
                    id: string;
                    ciphertext: string;
                }[];
                adapterParams: {
                    [x: string]: any;
                };
            }[], "asr.models[].upstreams must contain at least 1 entry">]>;
        }, undefined>, undefined>;
    }, undefined>, undefined>;
    readonly defaults: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly perAttemptTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 30000>;
        readonly fullChainTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 60000>;
        readonly fallbackHttpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
    }, undefined>, {
        readonly perAttemptTimeoutMs: 30000;
        readonly fullChainTimeoutMs: 60000;
        readonly fallbackHttpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
    }>;
}, undefined>;
/**
 * Config entry schemas are the single source of truth for:
 * - runtime validation
 * - default values
 * - Redis serialization/deserialization shape
 */
declare const ConfigEntrySchemas: {
    readonly FLUX_PER_REQUEST: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 5>;
    readonly INITIAL_USER_FLUX: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 0>;
    readonly FLUX_PER_1K_TOKENS: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 1>;
    readonly FLUX_PER_1K_CHARS_TTS: import("valibot").NumberSchema<undefined>;
    readonly TTS_DEBT_TTL_SECONDS: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 86400>;
    readonly AUTH_RATE_LIMIT_MAX: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 20>;
    readonly AUTH_RATE_LIMIT_WINDOW_SEC: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 60>;
    readonly STRIPE_FLUX_PRODUCT_ID: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
    readonly STRIPE_PAYMENT_METHODS: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").StringSchema<undefined>, undefined>, undefined>;
    readonly STRIPE_PAYMENT_METHOD_OPTIONS: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
    readonly DEFAULT_TTS_VOICES: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").StringSchema<undefined>, undefined>, undefined>, {}>;
    readonly DEFAULT_CHAT_MODEL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "DEFAULT_CHAT_MODEL must not be empty">]>;
    readonly DEFAULT_TTS_MODEL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "DEFAULT_TTS_MODEL must not be empty">]>;
    readonly LLM_ROUTER_CONFIG: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly llm: import("valibot").ObjectSchema<{
            readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
                readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "llm.upstreams[].baseURL must not be empty">]>;
                    readonly overrideModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
                    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                    }, undefined>, undefined>, import("valibot").CheckAction<{
                        id: string;
                        ciphertext: string;
                    }[], "llm.upstreams[].keys must contain at least 1 entry">]>;
                    readonly headerTemplate: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, "Bearer {KEY}">;
                    readonly timeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, undefined>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    baseURL: string;
                    overrideModel?: string | undefined;
                    keys: {
                        id: string;
                        ciphertext: string;
                    }[];
                    headerTemplate: string;
                    timeoutMs?: number | undefined;
                }[], "llm.models[].upstreams must contain at least 1 entry">]>;
                readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                    readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
                    readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
                }, undefined>, {
                    readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
                    readonly onTimeout: true;
                }>;
            }, undefined>, undefined>;
        }, undefined>;
        readonly tts: import("valibot").ObjectSchema<{
            readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
                readonly provider: import("valibot").PicklistSchema<["azure", "dashscope-cosyvoice", "stepfun", "volcengine"], undefined>;
                readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "tts.upstreams[].baseURL must not be empty">]>;
                    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                    }, undefined>, undefined>, import("valibot").CheckAction<{
                        id: string;
                        ciphertext: string;
                    }[], "tts.upstreams[].keys must contain at least 1 entry">]>;
                    readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
                    readonly maxConcurrency: import("valibot").OptionalSchema<import("valibot").SchemaWithPipe<readonly [import("valibot").NumberSchema<undefined>, import("valibot").CheckAction<number, "tts.upstreams[].maxConcurrency must be >= 1 when set">]>, undefined>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    baseURL: string;
                    keys: {
                        id: string;
                        ciphertext: string;
                    }[];
                    adapterParams: {
                        [x: string]: any;
                    };
                    maxConcurrency?: number | undefined;
                }[], "tts.models[].upstreams must contain at least 1 entry">]>;
                readonly fallbackTriggers: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
                    readonly httpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
                    readonly onTimeout: import("valibot").OptionalSchema<import("valibot").BooleanSchema<undefined>, true>;
                }, undefined>, {
                    readonly httpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
                    readonly onTimeout: true;
                }>;
            }, undefined>, undefined>;
        }, undefined>;
        readonly asr: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly models: import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").ObjectSchema<{
                readonly provider: import("valibot").PicklistSchema<["aliyun-nls"], undefined>;
                readonly upstreams: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                    readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                        readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                        readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
                    }, undefined>, undefined>, import("valibot").CheckAction<{
                        id: string;
                        ciphertext: string;
                    }[], "asr.upstreams[].keys must contain at least 1 entry">]>;
                    readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
                }, undefined>, undefined>, import("valibot").CheckAction<{
                    keys: {
                        id: string;
                        ciphertext: string;
                    }[];
                    adapterParams: {
                        [x: string]: any;
                    };
                }[], "asr.models[].upstreams must contain at least 1 entry">]>;
            }, undefined>, undefined>;
        }, undefined>, undefined>;
        readonly defaults: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly perAttemptTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 30000>;
            readonly fullChainTimeoutMs: import("valibot").OptionalSchema<import("valibot").NumberSchema<undefined>, 60000>;
            readonly fallbackHttpCodes: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").NumberSchema<undefined>, undefined>, readonly [401, 402, 403, 429, 500, 502, 503, 504]>;
        }, undefined>, {
            readonly perAttemptTimeoutMs: 30000;
            readonly fullChainTimeoutMs: 60000;
            readonly fallbackHttpCodes: readonly [401, 402, 403, 429, 500, 502, 503, 504];
        }>;
    }, undefined>, undefined>;
    readonly UNSPEECH_UPSTREAM: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
        readonly restBaseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.restBaseURL must not be empty">]>;
        readonly streaming: import("valibot").OptionalSchema<import("valibot").ObjectSchema<{
            readonly baseURL: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.baseURL must not be empty">]>;
            readonly keys: import("valibot").SchemaWithPipe<readonly [import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].id must not be empty">, import("valibot").RegexAction<string, "keys[].id must not contain \"|\" (reserved AAD separator)">]>;
                readonly ciphertext: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "keys[].ciphertext must not be empty">]>;
            }, undefined>, undefined>, import("valibot").CheckAction<{
                id: string;
                ciphertext: string;
            }[], "UNSPEECH_UPSTREAM.streaming.keys must contain at least 1 entry">]>;
            readonly adapterParams: import("valibot").OptionalSchema<import("valibot").RecordSchema<import("valibot").StringSchema<undefined>, import("valibot").AnySchema, undefined>, {}>;
            readonly models: import("valibot").OptionalSchema<import("valibot").ArraySchema<import("valibot").ObjectSchema<{
                readonly id: import("valibot").SchemaWithPipe<readonly [import("valibot").StringSchema<undefined>, import("valibot").NonEmptyAction<string, "UNSPEECH_UPSTREAM.streaming.models[].id must not be empty">]>;
                readonly name: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
                readonly description: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
            }, undefined>, undefined>, readonly []>;
            readonly defaultModel: import("valibot").OptionalSchema<import("valibot").StringSchema<undefined>, undefined>;
        }, undefined>, undefined>;
    }, undefined>, undefined>;
};
type ConfigDefinitions = {
    [K in keyof typeof ConfigEntrySchemas]: InferOutput<(typeof ConfigEntrySchemas)[K]>;
};
type ConfigKey = keyof ConfigDefinitions;
export declare function createConfigKVService(redis: Redis): {
    getOptional<K extends ConfigKey>(key: K): Promise<ConfigDefinitions[K] | null>;
    getOrThrow<K extends ConfigKey>(key: K): Promise<Exclude<ConfigDefinitions[K], undefined>>;
    get<K extends ConfigKey>(key: K): Promise<Exclude<ConfigDefinitions[K], undefined>>;
    set<K extends ConfigKey>(key: K, value: ConfigDefinitions[K]): Promise<void>;
};
export type ConfigKVService = ReturnType<typeof createConfigKVService>;

