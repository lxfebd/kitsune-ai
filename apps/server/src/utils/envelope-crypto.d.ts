import { Buffer } from 'node:buffer';
/**
 * AES-GCM authenticated additional data (AAD) bound to each ciphertext.
 *
 * Binding the model name + key entry id into AAD prevents blob-swap attacks:
 * an attacker with configKV write access could move a valid ciphertext from
 * one (model, key entry) slot to another, but the decrypt step verifies the
 * AAD context and rejects the move.
 */
export interface EnvelopeAad {
    modelName: string;
    keyEntryId: string;
}
interface CreateEnvelopeCryptoOptions {
    /** 32-byte master key (current). Required. */
    masterKey: Buffer;
    /**
     * 32-byte previous master key (during rotation only).
     *
     * When set, decrypt first tries `masterKey`; on auth-tag failure it retries
     * with `previousMasterKey`. Encrypt always uses `masterKey`. After all stored
     * ciphertexts have been re-encrypted under the new key, remove the previous
     * one from env.
     */
    previousMasterKey?: Buffer;
}
/**
 * Envelope-encrypt and decrypt provider API keys for at-rest storage.
 *
 * Use when:
 * - Storing provider API keys (OpenRouter, Azure Speech, etc.) inside configKV.
 * - Anywhere a secret needs at-rest encryption with rotation support inside
 *   `apps/server`.
 *
 * Expects:
 * - `masterKey` is 32 random bytes, loaded once at boot from
 *   `LLM_ROUTER_MASTER_KEY` (base64-decoded).
 * - `previousMasterKey` is set only during a rotation window so already-stored
 *   ciphertexts can still be decrypted.
 * - Callers pass the same `EnvelopeAad` value at encrypt and decrypt time.
 *
 * Returns:
 * - `encryptKey(...)` → string in the format `v1.<iv>.<ct>.<tag>` (base64url parts).
 * - `decryptKey(...)` → `Buffer` holding the plaintext bytes. Callers should
 *   `buf.fill(0)` in a `finally` once the value is no longer needed so the
 *   plaintext does not linger across GC cycles.
 */
export declare function createEnvelopeCrypto(options: CreateEnvelopeCryptoOptions): {
    encryptKey(plaintext: string, aad: EnvelopeAad): string;
    decryptKey(ciphertext: string, aad: EnvelopeAad): Buffer;
};
export type EnvelopeCrypto = ReturnType<typeof createEnvelopeCrypto>;
/**
 * Returns the first 8 hex characters of `SHA-256(plaintext)`. Used as
 * `kitsune.gen_ai.gateway.key.id` for OTel traces and metrics.
 *
 * Expects:
 * - `plaintext` is the raw secret. Never pass the encrypted ciphertext.
 *
 * Returns:
 * - 8 lowercase hex characters. Stable across processes for the same input.
 */
export declare function keyIdFromPlaintext(plaintext: string): string;

