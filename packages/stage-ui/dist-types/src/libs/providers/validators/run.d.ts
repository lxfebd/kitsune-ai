import type { ComposerTranslation } from 'vue-i18n';
import type { ProviderConfigValidator, ProviderDefinition, ProviderExtraMethods, ProviderRuntimeValidator } from '../types';
export type ProviderValidationStepStatus = 'idle' | 'validating' | 'valid' | 'invalid';
export type ProviderValidationStepKind = 'config' | 'provider';
export interface ProviderValidationStep {
    id: string;
    label: string;
    status: ProviderValidationStepStatus;
    reason: string;
    kind: ProviderValidationStepKind;
}
export interface ProviderValidationPlan {
    steps: ProviderValidationStep[];
    config: Record<string, unknown>;
    definition: ProviderDefinition;
    configValidators: ProviderConfigValidator<Record<string, unknown>>[];
    providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[];
    providerExtra: ProviderExtraMethods<Record<string, unknown>> | undefined;
    shouldValidate: boolean;
}
export interface ProviderValidationCallbacks {
    onValidatorStart?: (info: {
        kind: ProviderValidationStepKind;
        index: number;
        step: ProviderValidationStep;
    }) => void;
    onValidatorSuccess?: (info: {
        kind: ProviderValidationStepKind;
        index: number;
        step: ProviderValidationStep;
        result: {
            reason: string;
            valid: boolean;
        };
    }) => void;
    onValidatorError?: (info: {
        kind: ProviderValidationStepKind;
        index: number;
        step: ProviderValidationStep;
        error: unknown;
    }) => void;
}
export declare function createConfigValidationSteps(configValidators: ProviderConfigValidator<Record<string, unknown>>[]): ProviderValidationStep[];
export declare function createProviderValidationSteps(providerValidators: ProviderRuntimeValidator<Record<string, unknown>>[]): ProviderValidationStep[];
export declare function getProviderValidationIntervalMs(options: {
    definition: ProviderDefinition;
    contextOptions: {
        t: ComposerTranslation;
    };
    defaultIntervalMs?: number;
}): number | undefined;
export declare function getValidatorsOfProvider(options: {
    definition: ProviderDefinition;
    config: Record<string, unknown>;
    schemaDefaults: Record<string, unknown>;
    contextOptions: {
        t: ComposerTranslation;
    };
}): ProviderValidationPlan;
export declare function validateProvider(plan: ProviderValidationPlan, contextOptions: {
    t: ComposerTranslation;
}, callbacks?: ProviderValidationCallbacks): Promise<ProviderValidationStep[]>;
