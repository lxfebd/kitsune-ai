/**
 * Show a routing status message in the status bar.
 *
 * @param message - The message to display (e.g. "本地模型不可用，已切换至 OpenAI").
 * @param durationMs - How long to show the message. Defaults to 5000ms.
 */
export declare function showRouterStatus(message: string, durationMs?: number): void;
/**
 * Composable for consuming router status in Vue templates.
 */
export declare function useRouterStatus(): {
    routerStatusMessage: import("vue").Ref<string, string>;
    routerStatusVisible: import("vue").Ref<boolean, boolean>;
};
