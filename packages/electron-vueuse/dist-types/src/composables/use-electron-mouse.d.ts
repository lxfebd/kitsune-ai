import type { UseMouseOptions } from '@vueuse/core';
export declare function useElectronMouseEventTarget(): import("vue").Ref<{
    addEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => void;
    dispatchEvent: (event: Event) => boolean;
    removeEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => void;
}, EventTarget | {
    addEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) => void;
    dispatchEvent: (event: Event) => boolean;
    removeEventListener: (type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) => void;
}>;
export declare function useElectronMouse(options?: UseMouseOptions): import("@vueuse/core").UseMouseReturn;
