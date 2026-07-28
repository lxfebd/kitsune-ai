/**
 * Maps provider audio format keys to response MIME types.
 *
 * Use when:
 * - A TTS adapter forwards OpenAI-shaped `response_format` / provider
 *   encoding keys through unspeech and needs a gateway fallback MIME type.
 *
 * Expects:
 * - `format` is the exact provider/OpenAI format key.
 *
 * Returns:
 * - A known audio MIME type, or `application/octet-stream` for unknown custom
 *   formats so operators can still experiment through config.
 */
export declare function audioMimeFromFormat(format: string): string;
