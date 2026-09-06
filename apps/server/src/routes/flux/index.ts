import type { FluxService } from '../../services/domain/flux'
import type { FluxTransactionService } from '../../services/domain/flux-transaction'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { parse } from 'valibot'

import { LimitOffsetPaginationQuerySchema } from '../../utils/http-query'

export function createFluxRoutes(
  fluxService: FluxService,
  fluxTransactionService: FluxTransactionService,
) {
  return new Hono<HonoEnv>()
    .get('/', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const flux = await fluxService.getFlux(user.id)
      return c.json(flux)
    })
    .get('/stats', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const stats = await fluxTransactionService.getStats(user.id)
      return c.json(stats)
    })
    .get('/history', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const { limit, offset } = parse(LimitOffsetPaginationQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      })

      const { records, hasMore } = await fluxTransactionService.getHistory(user.id, limit, offset)

      return c.json({
        records: records.map(r => ({
          id: r.id,
          type: r.type,
          amount: r.amount,
          description: r.description,
          metadata: r.metadata,
          createdAt: r.createdAt.toISOString(),
        })),
        hasMore,
      })
    })
}
