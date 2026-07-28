import type { Storage, StorageValue } from 'unstorage';
import type { Character } from '../types/character';
/**
 * Options shared by character model persistence operations.
 */
export interface CharacterModelOptions {
    /**
     * Cancels the operation before local storage IO starts.
     */
    abortSignal?: AbortSignal;
}
/**
 * Local persistence boundary for characters.
 */
export interface CharactersModel {
    /**
     * Lists locally persisted characters.
     */
    list: (options?: CharacterModelOptions) => Promise<Character[]>;
    /**
     * Replaces the locally persisted character snapshot.
     */
    saveAll: (characters: Character[], options?: CharacterModelOptions) => Promise<void>;
    /**
     * Inserts or replaces one locally persisted character by `id`.
     */
    upsert: (character: Character, options?: CharacterModelOptions) => Promise<void>;
    /**
     * Removes one locally persisted character by `id`.
     */
    remove: (id: string, options?: CharacterModelOptions) => Promise<void>;
}
/**
 * Runtime dependencies required to create the character persistence model.
 */
export interface CreateCharactersModelParams {
    /**
     * Unstorage-compatible backend used for the existing local character snapshot.
     */
    storage: Storage<StorageValue>;
}
/**
 * Creates a local persistence boundary for characters.
 *
 * Use when:
 * - Wiring a runtime-specific storage implementation.
 * - Testing character persistence without mocking module imports.
 *
 * Expects:
 * - `params.storage` is an unstorage-compatible storage instance.
 *
 * Returns:
 * - A character model that reads and writes the existing `local:characters` key.
 */
export declare function createCharactersModel(params: CreateCharactersModelParams): CharactersModel;
export declare const charactersModel: CharactersModel;
