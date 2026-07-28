import type { MaybeRefOrGetter, Ref } from 'vue';
interface CircleHitTestInput {
    gl: WebGL2RenderingContext | WebGLRenderingContext;
    clientX: number;
    clientY: number;
    left: number;
    top: number;
    width: number;
    height: number;
    radius: number;
    threshold: number;
}
export declare function isCanvasRegionTransparent({ gl, clientX, clientY, left, top, width, height, radius, threshold, }: CircleHitTestInput): boolean;
export declare function useCanvasPixelAtPoint(canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>, pointX: MaybeRefOrGetter<number>, pointY: MaybeRefOrGetter<number>): {
    inCanvas: Ref<boolean>;
    pixel: Ref<Uint8Array | number[]>;
};
export declare function useCanvasPixelIsTransparent(pixel: Ref<Uint8Array | number[]>, threshold?: number): Ref<boolean>;
export declare function useCanvasPixelIsTransparentAtPoint(canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>, pointX: MaybeRefOrGetter<number>, pointY: MaybeRefOrGetter<number>, optionsOrThreshold?: number | {
    threshold?: number;
    regionRadius?: number;
}): Ref<boolean>;

