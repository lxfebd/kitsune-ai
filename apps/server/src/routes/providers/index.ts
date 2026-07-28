import type { ProviderService } from '../../services/domain/providers'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { createBadRequestError, createNotFoundError } from '../../utils/error'
import { CreateProviderConfigSchema, UpdateProviderConfigSchema } from './schema'

export function createProviderRoutes(providerService: ProviderService) {
  return new Hono<HonoEnv>()
    .get('/', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const providers = await providerService.findAll(user.id)
      return c.json(providers)
    })

    .get('/:id', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const id = c.req.param('id')
      const provider = await providerService.findById(id, user.id)
      if (!provider)
        throw createNotFoundError()

      return c.json(provider)
    })

    .post('/', async (c) => {
      const user = c.get('user') || { id: 'anonymous' }
      const body = await c.req.json()
      const result = safeParse(CreateProviderConfigSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      const provider = await providerService.createUserConfig({
        ...result.output,
        ownerId: user.id,
      })

      return c.json(provider, 201)
    })

    .patch('/:id', async (c) => {
      const id = c.req.param('id')
      const body = await c.req.json()
      const result = safeParse(UpdateProviderConfigSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      const existing = await providerService.findUserConfigById(id)
      if (!existing)
        throw createNotFoundError()

      const updated = await providerService.updateUserConfig(id, result.output)
      return c.json(updated)
    })

    .delete('/:id', async (c) => {
      const id = c.req.param('id')

      const existing = await providerService.findUserConfigById(id)
      if (!existing)
        throw createNotFoundError()

      await providerService.deleteUserConfig(id)
      return c.body(null, 204)
    })
}
