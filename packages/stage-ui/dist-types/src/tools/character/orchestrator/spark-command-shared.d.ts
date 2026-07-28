import type { JsonSchema } from 'xsschema';
import { ContextUpdateStrategy } from '@kitsune/server-sdk';
import { z } from 'zod/v4';
export declare const sparkCommandIntentSchema: z.ZodEnum<{
    resume: "resume";
    pause: "pause";
    context: "context";
    action: "action";
    plan: "plan";
    proposal: "proposal";
    reroute: "reroute";
}>;
export declare const sparkCommandPrioritySchema: z.ZodEnum<{
    high: "high";
    low: "low";
    critical: "critical";
    normal: "normal";
}>;
export declare const sparkCommandInterruptSchema: z.ZodUnion<readonly [z.ZodLiteral<"force">, z.ZodLiteral<"soft">, z.ZodLiteral<false>]>;
export declare const sparkCommandGuidanceOptionSchema: z.ZodObject<{
    label: z.ZodString;
    steps: z.ZodArray<z.ZodString>;
    rationale: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
    possibleOutcome: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    risk: z.ZodUnion<readonly [z.ZodEnum<{
        none: "none";
        high: "high";
        low: "low";
        medium: "medium";
    }>, z.ZodNull]>;
    fallback: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    triggers: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
}, z.core.$strict>;
export declare const sparkCommandPersonaSchema: z.ZodObject<{
    traits: z.ZodString;
    strength: z.ZodEnum<{
        high: "high";
        low: "low";
        medium: "medium";
        "very-high": "very-high";
        "very-low": "very-low";
    }>;
}, z.core.$strict>;
export declare const sparkNotifyCommandGuidanceSchema: z.ZodObject<{
    type: z.ZodEnum<{
        instruction: "instruction";
        proposal: "proposal";
        "memory-recall": "memory-recall";
    }>;
    persona: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
        traits: z.ZodString;
        strength: z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
            "very-high": "very-high";
            "very-low": "very-low";
        }>;
    }, z.core.$strict>>, z.ZodNull]>;
    options: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        steps: z.ZodArray<z.ZodString>;
        rationale: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
        possibleOutcome: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        risk: z.ZodUnion<readonly [z.ZodEnum<{
            none: "none";
            high: "high";
            low: "low";
            medium: "medium";
        }>, z.ZodNull]>;
        fallback: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        triggers: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const sparkNotifyCommandItemSchema: z.ZodObject<{
    destinations: z.ZodArray<z.ZodString>;
    interrupt: z.ZodUnion<readonly [z.ZodEnum<{
        false: "false";
        force: "force";
        soft: "soft";
    }>, z.ZodNull]>;
    priority: z.ZodUnion<readonly [z.ZodEnum<{
        high: "high";
        low: "low";
        critical: "critical";
        normal: "normal";
    }>, z.ZodNull]>;
    intent: z.ZodUnion<readonly [z.ZodEnum<{
        resume: "resume";
        pause: "pause";
        context: "context";
        action: "action";
        plan: "plan";
        proposal: "proposal";
        reroute: "reroute";
    }>, z.ZodNull]>;
    ack: z.ZodString;
    guidance: z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodEnum<{
            instruction: "instruction";
            proposal: "proposal";
            "memory-recall": "memory-recall";
        }>;
        persona: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
            traits: z.ZodString;
            strength: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
                "very-high": "very-high";
                "very-low": "very-low";
            }>;
        }, z.core.$strict>>, z.ZodNull]>;
        options: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            steps: z.ZodArray<z.ZodString>;
            rationale: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
            possibleOutcome: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
            risk: z.ZodUnion<readonly [z.ZodEnum<{
                none: "none";
                high: "high";
                low: "low";
                medium: "medium";
            }>, z.ZodNull]>;
            fallback: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
            triggers: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodNull]>;
}, z.core.$strict>;
export declare const sparkCommandMetadataEntrySchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>;
}, z.core.$strict>;
export declare const sparkCommandContextSchema: z.ZodObject<{
    lane: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
    ideas: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    hints: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    strategy: z.ZodEnum<typeof ContextUpdateStrategy>;
    text: z.ZodString;
    destinations: z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodObject<{
        all: z.ZodLiteral<true>;
    }, z.core.$strict>, z.ZodObject<{
        include: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        exclude: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    }, z.core.$strict>]>>;
    metadata: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>;
    }, z.core.$strict>>, z.ZodNull]>;
}, z.core.$strict>;
export declare const sparkCommandGuidanceSchema: z.ZodObject<{
    type: z.ZodEnum<{
        instruction: "instruction";
        proposal: "proposal";
        "memory-recall": "memory-recall";
    }>;
    persona: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
        traits: z.ZodString;
        strength: z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
            "very-high": "very-high";
            "very-low": "very-low";
        }>;
    }, z.core.$strict>>, z.ZodNull]>;
    options: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        steps: z.ZodArray<z.ZodString>;
        rationale: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
        possibleOutcome: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        risk: z.ZodUnion<readonly [z.ZodEnum<{
            none: "none";
            high: "high";
            low: "low";
            medium: "medium";
        }>, z.ZodNull]>;
        fallback: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        triggers: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const sparkCommandToolSchema: z.ZodObject<{
    destinations: z.ZodArray<z.ZodString>;
    interrupt: z.ZodUnion<readonly [z.ZodUnion<readonly [z.ZodLiteral<"force">, z.ZodLiteral<"soft">, z.ZodLiteral<false>]>, z.ZodNull]>;
    priority: z.ZodUnion<readonly [z.ZodEnum<{
        high: "high";
        low: "low";
        critical: "critical";
        normal: "normal";
    }>, z.ZodNull]>;
    intent: z.ZodUnion<readonly [z.ZodEnum<{
        resume: "resume";
        pause: "pause";
        context: "context";
        action: "action";
        plan: "plan";
        proposal: "proposal";
        reroute: "reroute";
    }>, z.ZodNull]>;
    ack: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
    parentEventId: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
    guidance: z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodEnum<{
            instruction: "instruction";
            proposal: "proposal";
            "memory-recall": "memory-recall";
        }>;
        persona: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
            traits: z.ZodString;
            strength: z.ZodEnum<{
                high: "high";
                low: "low";
                medium: "medium";
                "very-high": "very-high";
                "very-low": "very-low";
            }>;
        }, z.core.$strict>>, z.ZodNull]>;
        options: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            steps: z.ZodArray<z.ZodString>;
            rationale: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
            possibleOutcome: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
            risk: z.ZodUnion<readonly [z.ZodEnum<{
                none: "none";
                high: "high";
                low: "low";
                medium: "medium";
            }>, z.ZodNull]>;
            fallback: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
            triggers: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodNull]>;
    contexts: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
        lane: z.ZodUnion<readonly [z.ZodString, z.ZodNull]>;
        ideas: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        hints: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        strategy: z.ZodEnum<typeof ContextUpdateStrategy>;
        text: z.ZodString;
        destinations: z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodObject<{
            all: z.ZodLiteral<true>;
        }, z.core.$strict>, z.ZodObject<{
            include: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
            exclude: z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodNull]>;
        }, z.core.$strict>]>>;
        metadata: z.ZodUnion<readonly [z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            value: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>;
        }, z.core.$strict>>, z.ZodNull]>;
    }, z.core.$strict>>, z.ZodNull]>;
}, z.core.$strict>;
export declare function normalizeSparkCommandMetadata(metadata: z.infer<typeof sparkCommandMetadataEntrySchema>[] | undefined): Record<string, string | number | boolean | null> | undefined;
export declare function normalizeSparkCommandPersona(persona: z.infer<typeof sparkCommandPersonaSchema>[] | undefined): Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'> | undefined;
export declare function normalizeSparkCommandGuidanceOptions(options: z.infer<typeof sparkCommandGuidanceOptionSchema>[]): {
    rationale: string | undefined;
    possibleOutcome: string[] | undefined;
    risk: "none" | "high" | "low" | "medium" | undefined;
    fallback: string[] | undefined;
    triggers: string[] | undefined;
    label: string;
    steps: string[];
}[];
export declare function normalizeSparkCommandDestinations(destinations: z.infer<typeof sparkCommandContextSchema>['destinations']): string[] | {
    all: true;
} | {
    include: string[] | undefined;
    exclude: string[] | undefined;
} | undefined;
export declare function normalizeSparkCommandStringList(value: string[] | null): string[] | undefined;
export declare function normalizeSparkCommandStringValue(value: string | null): string | undefined;
export declare function normalizeNullableAnyOf(schema: JsonSchema): JsonSchema;
