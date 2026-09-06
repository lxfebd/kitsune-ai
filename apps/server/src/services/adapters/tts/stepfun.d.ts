import type { TtsAdapter } from './types';
/**
 * StepFun TTS adapter.
 *
 * Use when:
 * - Routing hosted speech synthesis to StepFun through unspeech's
 *   OpenAI-compatible `stepfun/*` backend.
 *
 * Expects:
 * - `ctx.unspeechBaseURL` points at an unspeech deployment that includes the
 *   StepFun backend.
 * - `ctx.keyPlaintext` is the StepFun API key.
 * - `ctx.adapterParams.model` optionally selects `stepaudio-2.5-tts`,
 *   `step-tts-2`, or `step-tts-mini`.
 *
 * Returns:
 * - {@link TtsResult} with the upstream audio body and content type.
 */
export declare const stepfunAdapter: TtsAdapter;
