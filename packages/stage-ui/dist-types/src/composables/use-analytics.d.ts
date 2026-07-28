/**
 * User-facing chat surfaces that can emit product analytics.
 */
export type ConversationAnalyticsSurface = 'web' | 'mobile' | 'electron';
/**
 * Low-cardinality source names for conversation action events.
 */
export type ConversationAnalyticsSource = 'chat_controls' | 'history' | 'sessions_drawer';
export declare function useAnalytics(): {
    privacyPolicyUrl: import("vue").ComputedRef<string>;
    trackProviderClick: (providerId: string, module: string) => void;
    trackFirstMessage: () => void;
    trackPricingViewed: (surface: string, planPeriod?: "monthly" | "annual" | "one_time") => void;
    trackPlanSelected: (planId: string, properties?: {
        price_minor_unit?: number;
        currency?: string;
    }) => void;
    trackCheckoutStarted: (planId: string, properties: {
        checkout_session_id?: string;
        price_minor_unit?: number;
        currency?: string;
    }) => void;
    trackSignup: (method: "email" | "google" | "github" | string) => void;
    trackFirstModelSelected: (modelId: string, provider: string) => void;
    trackCharacterCreated: (properties: {
        character_type: "built_in" | "custom";
        voice_enabled: boolean;
    }) => void;
    trackVoiceModeActivated: (characterId?: string) => void;
    trackModelSwitched: (fromModel: string, toModel: string, reason?: "manual" | "auto") => void;
    trackChatSessionStarted: (modelId: string, sessionIndex?: number) => void;
    trackMessageSendStarted: (properties: {
        source: "text" | "voice";
        model?: string;
    }) => void;
    trackLlmRequestStarted: (properties: {
        model: string;
        provider: string;
        has_voice: boolean;
    }) => void;
    trackLlmFirstToken: (properties: {
        model: string;
        ttfb_ms: number;
    }) => void;
    trackAssistantResponseRendered: (properties: {
        model: string;
        latency_ms: number;
    }) => void;
    trackMessageRound: (properties: {
        duration_ms: number;
        has_voice: boolean;
        model: string;
    }) => void;
    trackTtsStopClicked: (properties: {
        reason: "manual-chat";
    }) => void;
    trackChatSessionSelected: (properties: {
        source: "sessions_drawer";
        message_count: number;
        cloud_synced: boolean;
    }) => void;
    trackChatMessageDeleted: (properties: {
        source: "history";
        message_role: string;
    }) => void;
    trackChatMessagesCleared: (properties: {
        source: "chat_controls";
        message_count: number;
    }) => void;
    trackChatMessageRetried: (properties: {
        source: "history";
    }) => void;
    trackSttStarted: (provider: string) => void;
    trackSttSucceeded: (properties: {
        provider: string;
        latency_ms: number;
        char_count: number;
        stream: boolean;
    }) => void;
    trackSttFailed: (properties: {
        provider: string;
        error_code?: string;
    }) => void;
    trackPttPressed: () => void;
    trackPttReleased: (holdMs: number) => void;
    trackTtsIntentStarted: (properties: {
        intent_id: string;
        turn_id?: string;
    }) => void;
    trackTtsIntentEnded: (properties: {
        intent_id: string;
        turn_id?: string;
        duration_ms: number;
    }) => void;
    trackTtsIntentCancelled: (properties: {
        intent_id: string;
        turn_id?: string;
        reason?: string;
    }) => void;
    trackAutonomousGenerateText: (properties: {
        model: string;
        reason?: string;
    }) => void;
    trackAppLoaded: (properties: {
        platform: "web" | "desktop" | "mobile";
        version: string;
        cold_start_ms?: number;
    }) => void;
    trackCharacterDeleted: (properties: {
        character_id: string;
    }) => void;
    trackCharacterSwitched: (properties: {
        from_character_id?: string;
        to_character_id: string;
    }) => void;
    trackChatSessionDeleted: (properties: {
        session_id: string;
        message_count: number;
    }) => void;
    trackOnboardingStepCompleted: (step: string) => void;
    trackOnboardingSkipped: (at_step: string) => void;
    trackFluxLowWarningShown: (properties: {
        balance: number;
        threshold: number;
    }) => void;
    trackFluxTopupClicked: (properties: {
        balance: number;
        surface: string;
    }) => void;
    trackVoiceCloneCreated: (properties: {
        provider: string;
    }) => void;
    trackDeviceChannelConnected: (properties: {
        channel: string;
    }) => void;
};
