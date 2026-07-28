import type { VisionWorkloadId } from './use-vision-workloads';
export interface VisionInferenceInput {
    imageDataUrl: string;
    workloadId: VisionWorkloadId;
    promptOverride?: string;
}
export declare function useVisionInference(): {
    lastText: import("vue").Ref<string, string>;
    runVisionInference: (input: VisionInferenceInput) => Promise<string>;
};
