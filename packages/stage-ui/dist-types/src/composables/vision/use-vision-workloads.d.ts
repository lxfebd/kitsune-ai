export type VisionWorkloadId = 'screen:interpret' | 'screen:understand' | 'screen:ocr' | 'screen:ui-automation';
export interface VisionWorkloadConfig {
    id: VisionWorkloadId;
    label: string;
    description: string;
    prompt: string;
}
export declare const VISION_WORKLOADS: VisionWorkloadConfig[];
export declare function getVisionWorkload(id: VisionWorkloadId): VisionWorkloadConfig;
