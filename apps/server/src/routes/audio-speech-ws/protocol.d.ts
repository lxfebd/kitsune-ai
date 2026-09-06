import type { RawData } from 'ws';
/**
 * Normalizes websocket text payload chunks.
 *
 * Before:
 * - `Buffer.from("frame")`
 * - `[Buffer.from("a"), Buffer.from("b")]`
 *
 * After:
 * - `"frame"`
 * - `"ab"`
 */
export declare function bufferToString(data: RawData): string;
/**
 * Normalizes websocket binary payload chunks.
 *
 * Before:
 * - `Buffer.from("audio")`
 * - `[Buffer.from("a"), Buffer.from("b")]`
 *
 * After:
 * - `ArrayBuffer`
 */
export declare function toBufferLike(data: RawData): ArrayBuffer;
/**
 * Reads authoritative TTS usage characters from an upstream control payload.
 *
 * Before:
 * - `{ usage: { text_words: 42 } }`
 * - `{}`
 *
 * After:
 * - `42`
 * - `null`
 */
export declare function readUsageChars(payload: Record<string, unknown> | undefined): number | null;
