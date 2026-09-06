import type { Context } from 'hono';
import type { ConfigKVService } from '../../services/adapters/config-kv';
import type { RouterConfig } from '../../services/domain/llm-router/types';
import type { EnvelopeCrypto } from '../../utils/envelope-crypto';
type AliyunNlsRegion = 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal';
/**
 * Resolves optional official Aliyun NLS credentials from router config.
 */
export declare function resolveOfficialAliyunNlsCredentials(routerConfig: RouterConfig | null | undefined, envelopeCrypto: EnvelopeCrypto, modelName?: string): {
    accessKeyId: string;
    accessKeySecret: string;
    appKey: string;
    region: AliyunNlsRegion;
} | null;
/**
 * Handles realtime transcription audio upload streams.
 */
export declare function createAudioTranscriptionStreamHandler(input: {
    configKV: ConfigKVService;
    envelopeCrypto: EnvelopeCrypto;
}): (c: Context) => Promise<Response>;

