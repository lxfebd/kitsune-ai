import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../types/hono'

/**
 * Session middleware is disabled: user login/OIDC flows have been removed.
 * Always sets user/session to null and continues.
 */
export function sessionMiddleware(): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    c.set('user', null)
    c.set('session', null)
    await next()
  }
}

/**
 * Auth guard that supports optional auth integration.
 *
 * NOTICE:
 * When an `auth` object is provided (e.g., from test harness), it will be used
 * to fetch the session via `auth.api.getSession`. Otherwise, user/session are
 * set to null and the request proceeds (auth is disabled in production).
 */
export function createAuthGuard(auth?: { api: { getSession: (ctx: any) => Promise<any> } }): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    if (auth) {
      try {
        const session = await auth.api.getSession(c)
        if (session) {
          c.set('user', session.user)
          c.set('session', session.session)
        }
        else {
          c.set('user', null)
          c.set('session', null)
        }
      }
      catch {
        c.set('user', null)
        c.set('session', null)
      }
    }
    else {
      c.set('user', null)
      c.set('session', null)
    }
    await next()
  }
}

/**
 * Default auth guard (no auth integration, allows all requests through).
 */
export const authGuard: MiddlewareHandler<HonoEnv> = async (c, next) => {
  c.set('user', null)
  c.set('session', null)
  await next()
}
