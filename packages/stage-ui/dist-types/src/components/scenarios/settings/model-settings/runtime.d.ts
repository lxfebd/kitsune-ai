import type { StageAvatarBoundsPayload, StageViewState } from '@kitsune/stage-shared/godot-stage';
import type { StageModelRenderer } from '../../../../stores/settings/stage-model';
export type ModelSettingsRuntimeRenderer = 'disabled' | 'live2d' | 'vrm' | 'spine' | 'godot';
export type ModelSettingsRuntimePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error';
export interface ModelSettingsRuntimeSnapshot {
    ownerInstanceId: string;
    renderer: ModelSettingsRuntimeRenderer;
    phase: ModelSettingsRuntimePhase;
    controlsLocked: boolean;
    previewAvailable: boolean;
    canCapturePreview: boolean;
    lastError?: string;
    updatedAt: number;
}
export declare function createEmptyModelSettingsRuntimeSnapshot(overrides?: Partial<ModelSettingsRuntimeSnapshot>): ModelSettingsRuntimeSnapshot;
/** Clones Godot view state into a mutable settings draft, optionally preserving local FOV edits. */
export declare function cloneStageViewStateForDraft(state: StageViewState, options?: {
    fovDeg?: number;
}): StageViewState;
/** Resolves the symmetric settings slider range from the model-load bootstrap snapshot. */
export declare function resolveGodotCameraPositionRange(options: {
    avatarBounds?: StageAvatarBoundsPayload | null;
    loadTimeState: StageViewState | null;
}): number;
/** Resolves which settings component the model settings panel should mount. */
export declare function resolveModelSettingsPanelRenderer(options: {
    settingsRenderer: StageModelRenderer;
    runtimeRenderer: ModelSettingsRuntimeRenderer;
}): ModelSettingsRuntimeRenderer;
/** Maps component load state into the shared model settings runtime phase. */
export declare function resolveComponentStateToRuntimePhase(componentState: 'pending' | 'loading' | 'mounted', options?: {
    hasModel?: boolean;
}): ModelSettingsRuntimePhase;
