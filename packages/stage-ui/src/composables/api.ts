import type { AppType } from '../../../../apps/server/src/app'

import { hc } from 'hono/client'

import { SERVER_URL } from '../libs/server'

export const client = hc<AppType>(SERVER_URL, {
  fetch: fetch,
})

export type StageApiClient = typeof client
