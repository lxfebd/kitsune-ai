import type { Ref } from 'vue';
export declare function usePromoBannerLayout(locale: Ref<string>): {
    buttonClass: import("vue").ComputedRef<"text-xs font-700" | "font-sans text-[12px] font-600 tracking-normal">;
    descriptionClass: import("vue").ComputedRef<"max-w-58 text-[13px] leading-5" | "max-w-60 font-sans text-[12px] leading-4.5 font-500">;
    isCjkLocale: import("vue").ComputedRef<boolean>;
    metaClass: import("vue").ComputedRef<"text-[11px]" | "font-sans text-[11px] font-500">;
    titleClass: import("vue").ComputedRef<"text-[28px] leading-none font-700" | "font-sans text-[22px] leading-tight font-600 tracking-normal">;
    watermarkClass: import("vue").ComputedRef<"text-5xl font-600" | "font-sans text-[44px] font-500 tracking-[0.08em]">;
};
