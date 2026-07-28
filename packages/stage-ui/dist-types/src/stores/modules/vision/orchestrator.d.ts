import type { VisionWorkloadId } from '../../../composables/vision/use-vision-workloads';
/**
 * Payload describing one captured frame routed through the vision orchestrator.
 */
export interface VisionCapturePayload {
    /** JPEG or PNG data URL captured from the selected source. */
    imageDataUrl: string;
    /** Vision workload that describes how the frame should be interpreted. */
    workloadId: VisionWorkloadId;
    /** Optional source identifier used to keep context updates stable per source. */
    sourceId?: string;
    /** Timestamp recorded when the frame was captured. */
    capturedAt?: number;
    /** When `true`, publish the inference result into the character context channel. */
    publishContext?: boolean;
}
/**
 * Coordinates screen-capture inference and optional context publishing for vision workflows.
 *
 * Use when:
 * - A renderer page captures frames and needs multimodal inference results
 * - Successful results may also need to become context updates for downstream modules
 *
 * Expects:
 * - The vision settings store to already contain an active provider and model
 *
 * Returns:
 * - A Pinia store that tracks the latest result, last error, and capture-processing actions
 */
export declare const useVisionOrchestratorStore: import("pinia").StoreDefinition<"vision-orchestrator", Pick<{
    lastText: import("vue").Ref<string, string>;
    lastResultText: import("vue").Ref<string, string>;
    lastResultAt: import("vue").Ref<number | null, number | null>;
    lastError: import("vue").Ref<string | null, string | null>;
    lastWorkloadId: import("vue").Ref<VisionWorkloadId, VisionWorkloadId>;
    processCapture: (payload: VisionCapturePayload) => Promise<{
        contextUpdates: number;
        text: string;
    }>;
    recordError: (error: unknown) => void;
}, "lastError" | "lastText" | "lastResultText" | "lastResultAt" | "lastWorkloadId">, Pick<{
    lastText: import("vue").Ref<string, string>;
    lastResultText: import("vue").Ref<string, string>;
    lastResultAt: import("vue").Ref<number | null, number | null>;
    lastError: import("vue").Ref<string | null, string | null>;
    lastWorkloadId: import("vue").Ref<VisionWorkloadId, VisionWorkloadId>;
    processCapture: (payload: VisionCapturePayload) => Promise<{
        contextUpdates: number;
        text: string;
    }>;
    recordError: (error: unknown) => void;
}, never>, Pick<{
    lastText: import("vue").Ref<string, string>;
    lastResultText: import("vue").Ref<string, string>;
    lastResultAt: import("vue").Ref<number | null, number | null>;
    lastError: import("vue").Ref<string | null, string | null>;
    lastWorkloadId: import("vue").Ref<VisionWorkloadId, VisionWorkloadId>;
    processCapture: (payload: VisionCapturePayload) => Promise<{
        contextUpdates: number;
        text: string;
    }>;
    recordError: (error: unknown) => void;
}, "processCapture" | "recordError">>;
