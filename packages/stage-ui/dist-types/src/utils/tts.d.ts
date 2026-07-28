import type { ReaderLike } from 'clustr';
export declare const TTS_FLUSH_INSTRUCTION = "\u200B";
export declare const TTS_SPECIAL_TOKEN = "\u2063";
export interface TTSInputChunk {
    text: string;
    words: number;
    reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special';
}
export interface TTSInputChunkOptions {
    boost?: number;
    minimumWords?: number;
    maximumWords?: number;
}
export interface TTSChunkItem {
    chunk: string;
    special: string | null;
}
/**
 * Processes the input string or UTF-8 byte stream reader into chunks suitable for TTS synthesis.
 *
 * @param input A string or a ReaderLike object that reads from an underlying UTF-8 byte stream.
 * @param options
 * @param options.boost Specifies the number of chunks to yield using greedier rules. This may help
 *                      reduce the initial delay when processing long input text.
 * @param options.minimumWords Minimum number of words in a chunk.
 * @param options.maximumWords Maximum number of words in a chunk.
 */
export declare function chunkTTSInput(input: string | ReaderLike, options?: TTSInputChunkOptions): AsyncGenerator<TTSInputChunk, void, unknown>;
export declare function chunkEmitter(reader: ReaderLike, pendingSpecials: string[], handler: (ttsSegment: TTSChunkItem) => Promise<void> | void): Promise<void>;
