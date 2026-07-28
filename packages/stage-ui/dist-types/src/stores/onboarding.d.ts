export declare const useOnboardingStore: import("pinia").StoreDefinition<"onboarding", Pick<{
    hasCompletedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    hasSkippedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    showingSetup: import("vue").Ref<boolean, boolean>;
    hasEssentialProviderConfigured: import("vue").ComputedRef<boolean>;
    hasEssentialProviderCredentialConfigured: import("vue").ComputedRef<boolean>;
    needsOnboarding: import("vue").ComputedRef<boolean>;
    markSetupCompleted: () => void;
    markSetupSkipped: () => void;
    resetSetupState: () => void;
    forceShowSetup: () => void;
}, "hasCompletedSetup" | "hasSkippedSetup" | "showingSetup">, Pick<{
    hasCompletedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    hasSkippedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    showingSetup: import("vue").Ref<boolean, boolean>;
    hasEssentialProviderConfigured: import("vue").ComputedRef<boolean>;
    hasEssentialProviderCredentialConfigured: import("vue").ComputedRef<boolean>;
    needsOnboarding: import("vue").ComputedRef<boolean>;
    markSetupCompleted: () => void;
    markSetupSkipped: () => void;
    resetSetupState: () => void;
    forceShowSetup: () => void;
}, "hasEssentialProviderConfigured" | "hasEssentialProviderCredentialConfigured" | "needsOnboarding">, Pick<{
    hasCompletedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    hasSkippedSetup: import("@vueuse/shared").RemovableRef<boolean>;
    showingSetup: import("vue").Ref<boolean, boolean>;
    hasEssentialProviderConfigured: import("vue").ComputedRef<boolean>;
    hasEssentialProviderCredentialConfigured: import("vue").ComputedRef<boolean>;
    needsOnboarding: import("vue").ComputedRef<boolean>;
    markSetupCompleted: () => void;
    markSetupSkipped: () => void;
    resetSetupState: () => void;
    forceShowSetup: () => void;
}, "markSetupCompleted" | "markSetupSkipped" | "resetSetupState" | "forceShowSetup">>;
