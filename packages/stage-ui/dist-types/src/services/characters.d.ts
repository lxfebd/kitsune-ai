import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character';
interface RequestOptions {
    init: {
        signal: AbortSignal;
    };
}
interface RemoteResponse<T> {
    json: () => Promise<T>;
    ok: boolean;
}
/**
 * Remote character API surface required by the character service.
 */
export interface CharactersRemoteClient {
    api: {
        v1: {
            characters: {
                '$get': (params: {
                    query: {
                        all: string;
                    };
                }, options?: RequestOptions) => Promise<RemoteResponse<unknown[]>>;
                '$post': (params: {
                    json: CreateCharacterPayload;
                }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                ':id': {
                    $delete: (params: {
                        param: {
                            id: string;
                        };
                    }, options?: RequestOptions) => Promise<{
                        ok: boolean;
                    }>;
                    $get: (params: {
                        param: {
                            id: string;
                        };
                    }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                    $patch: (params: {
                        json: UpdateCharacterPayload;
                        param: {
                            id: string;
                        };
                    }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                    bookmark: {
                        $post: (params: {
                            param: {
                                id: string;
                            };
                        }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                    };
                    like: {
                        $post: (params: {
                            param: {
                                id: string;
                            };
                        }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>;
                    };
                };
            };
        };
    };
}
/**
 * Options shared by character service operations.
 */
export interface CharacterServiceOptions {
    /**
     * Cancels the operation before or after remote IO.
     */
    abortSignal?: AbortSignal;
}
/**
 * Character domain operations used by controller stores.
 */
export interface CharactersService {
    /** Builds an optimistic local character from a create payload. */
    buildLocal: (userId: string, payload: CreateCharacterPayload) => Character;
    /** Fetches and parses the remote character list. */
    fetchRemote: (client: CharactersRemoteClient, params: {
        all?: boolean;
    }, options?: CharacterServiceOptions) => Promise<Character[]>;
    /** Fetches and parses one remote character. */
    fetchRemoteById: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>;
    /** Creates and parses one remote character. */
    createRemote: (client: CharactersRemoteClient, payload: CreateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>;
    /** Updates and parses one remote character. */
    updateRemote: (client: CharactersRemoteClient, id: string, payload: UpdateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>;
    /** Removes one remote character. */
    removeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<void>;
    /** Likes and parses one remote character. */
    likeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>;
    /** Bookmarks and parses one remote character. */
    bookmarkRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>;
}
/**
 * Creates the character service facade consumed by controller stores.
 *
 * Use when:
 * - Wiring controller stores to character domain operations.
 * - Tests need to replace the whole service surface with one mock object.
 *
 * Expects:
 * - No runtime dependencies are required yet.
 *
 * Returns:
 * - A stable object containing character domain operations.
 */
export declare function createCharactersService(): CharactersService;
export declare const charactersService: CharactersService;

