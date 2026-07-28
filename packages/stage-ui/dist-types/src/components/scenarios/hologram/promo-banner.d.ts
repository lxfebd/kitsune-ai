export interface PromoBannerItem {
    watermark: string;
    title: string;
    eventName: string;
    date: string;
    reward: string;
    cta: string;
}
export type PromoBannerItemKey = 'build' | 'spring' | 'coupon' | 'home';
export type PromoBannerAction = {
    type: 'route';
    to: string;
};
export interface PromoBannerVisual {
    key: PromoBannerItemKey;
    image: string;
    action: PromoBannerAction;
    accentClass: string;
    fallbackIcon: string;
    fallbackIconClass: string;
    fallbackClass: string;
}
export declare function getPromoBannerFallbackLabelKey(key: PromoBannerItemKey): string;
export declare const promoBannerVisuals: PromoBannerVisual[];
