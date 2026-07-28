import type { Context } from 'hono'

import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

import { createKeyRotator } from '../../services/domain/llm-router/key-rotator'
import { createServiceUnavailableError } from '../../utils/error'
import { createAliyunNlsStreamResponse } from './session'

type AliyunNlsRegion = 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'

const ALIYUN_NLS_REGION_FALLBACK: AliyunNlsRegion = 'cn-shanghai'
const ALIYUN_NLS_REGIONS = new Set<AliyunNlsRegion>([
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
])

const OFFICIAL_ASR_MODEL_NAME = 'auto'

function stringAdapterParam(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolves optional official Aliyun NLS credentials from router config.
 */
export function resolveOfficialAliyunNlsCredentials(
  routerConfig: RouterConfig | null | undefined,
  envelopeCrypto: EnvelopeCrypto,
  modelName: string = OFFICIAL_ASR_MODEL_NAME,
) {
  const model = routerConfig?.asr?.models[modelName]
  const upstream = model?.upstreams[0]
  if (model?.provider !== 'aliyun-nls' || !upstream)
    return null

  const iterator = createKeyRotator(upstream, envelopeCrypto, modelName, null, model.provider)[Symbol.iterator]()
  const next = iterator.next()
  if (next.done)
    return null

  const accessKeySecretBytes = next.value.plaintext
  try {
    const accessKeyId = stringAdapterParam(upstream.adapterParams, 'accessKeyId')
    const accessKeySecret = accessKeySecretBytes.toString('utf8').trim()
    const appKey = stringAdapterParam(upstream.adapterParams, 'appKey')
    const rawRegion = stringAdapterParam(upstream.adapterParams, 'region')
    if (!accessKeyId || !accessKeySecret || !appKey)
      return null

    const region = ALIYUN_NLS_REGIONS.has(rawRegion as AliyunNlsRegion)
      ? rawRegion as AliyunNlsRegion
      : ALIYUN_NLS_REGION_FALLBACK

    return {
      accessKeyId,
      accessKeySecret,
      appKey,
      region,
    }
  }
  finally {
    accessKeySecretBytes.fill(0)
  }
}

async function resolveOfficialAliyunNlsCredentialsFromConfig(input: {
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
}) {
  const routerConfig = await input.configKV.getOptional('LLM_ROUTER_CONFIG')
  const credentials = resolveOfficialAliyunNlsCredentials(routerConfig, input.envelopeCrypto)
  if (!credentials)
    return null

  return credentials
}

/**
 * Handles realtime transcription audio upload streams.
 */
export function createAudioTranscriptionStreamHandler(input: {
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
}) {
  return async function handleAudioTranscriptionStream(c: Context) {
    const credentials = await resolveOfficialAliyunNlsCredentialsFromConfig(input)
    if (!credentials)
      throw createServiceUnavailableError('Official ASR transcription is not configured in LLM_ROUTER_CONFIG.asr.models.auto', 'CONFIG_NOT_SET')

    const audioStream = c.req.raw.body
    if (!audioStream)
      throw createServiceUnavailableError('Streaming transcription request is missing audio body', 'REQUEST_BODY_NOT_STREAMABLE')

    return createAliyunNlsStreamResponse({
      audioStream: audioStream as ReadableStream<Uint8Array>,
      credentials,
    })
  }
}
