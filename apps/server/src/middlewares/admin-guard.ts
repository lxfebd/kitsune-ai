import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../types/hono'

/**
 * Admin guard is disabled: user login/OIDC flows have been removed.
 * Allows all requests through.
 */
export const adminGuard: MiddlewareHandler<HonoEnv> = async (_c, next) => {
  await next()
}
