import type { VoicePackService } from '../../services/domain/voice-packs'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

/**
 * Voice Pack routes.
 */
export function createVoicePackRoutes(service: VoicePackService) {
  return new Hono<HonoEnv>()
    .get('/', async (c) => {
      const packs = await service.listEnabled()
      return c.json(packs)
    })
}
