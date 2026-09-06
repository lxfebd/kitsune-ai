import type { VoicePackService } from '../../services/domain/voice-packs';
import type { HonoEnv } from '../../types/hono';
/**
 * Voice Pack routes.
 */
export declare function createVoicePackRoutes(service: VoicePackService): import("hono/hono-base").HonoBase<HonoEnv, {
    "/": {
        $get: {
            input: {};
            output: {
                updatedAt: string;
                id: string;
                name: string;
                createdAt: string;
                description: string | null;
                model: string;
                provider: string;
                voiceId: string;
                ttsModelId: string;
                params: {
                    [x: string]: string | number | boolean | null;
                };
                costMultiplier: number;
                enabled: boolean;
            }[];
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/", "/">;
