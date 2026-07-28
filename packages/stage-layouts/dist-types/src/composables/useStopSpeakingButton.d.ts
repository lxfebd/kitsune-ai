/**
 * Connects chat UI stop-speaking controls to the active stage speech output host.
 *
 * Use when:
 * - Chat input UI needs to stop assistant TTS playback without cancelling text generation.
 *
 * Expects:
 * - A Stage instance is mounted and consumes speech output stop requests.
 *
 * Returns:
 * - Visibility state for the button and a click handler for manual chat stops.
 */
export declare function useStopSpeakingButton(): {
    showStopSpeakingButton: import("vue").ComputedRef<boolean>;
    stopSpeakingFromChat: () => void;
};
