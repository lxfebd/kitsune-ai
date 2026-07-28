export type ColorFromElementMode = 'vibrant' | 'html2canvas' | 'both';
export declare function patchThemeSamplingHtml2CanvasClone(doc: Document): void;
export interface ColorFromElementOptions {
    /**
     * Which extraction pipeline to run. Use `'both'` to mirror the devtools view.
     * Defaults to `'both'`.
     */
    mode?: ColorFromElementMode;
    /**
     * Options for the Vibrant-based palette extraction.
     */
    vibrant?: {
        /**
         * Optional override for the image source; falls back to the `img` element's `currentSrc/src`.
         */
        imageSource?: string;
        /**
         * Ratio (0-1) of the image height to sample from the top edge. Defaults to 0.2.
         */
        sampleTopRatio?: number;
    };
    /**
     * Options for html2canvas-based sampling of the rendered element.
     */
    html2canvas?: {
        /**
         * Region forwarded to html2canvas. Provide only what you need; defaults to the live element box.
         */
        region?: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
        /**
         * How many pixels (height) to read from the captured canvas. Defaults to 20.
         */
        sampleHeight?: number;
        /**
         * Pixel stride when sampling the captured row. Defaults to 10 (i.e., every 10th pixel).
         */
        sampleStride?: number;
        /**
         * Canvas scale used by html2canvas. Defaults to 0.5.
         */
        scale?: number;
        allowTaint?: boolean;
        useCORS?: boolean;
        backgroundColor?: string | null;
        logging?: boolean;
        onclone?: (doc: Document) => void;
    };
}
export interface ColorFromElementResult {
    vibrant?: {
        palette: string[];
        dominant?: string;
    };
    html2canvas?: {
        average?: string;
        canvas?: HTMLCanvasElement;
    };
}
export declare function colorFromElement(element: HTMLElement, options?: ColorFromElementOptions): Promise<ColorFromElementResult>;
