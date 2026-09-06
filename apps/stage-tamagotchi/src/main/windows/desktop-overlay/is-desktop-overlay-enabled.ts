import { env } from 'node:process'

/**
 * Whether the desktop overlay feature is enabled.
 *
 * Kept in a separate lightweight module (zero heavy deps) so the main entry
 * can statically import the gate check without pulling in the heavy
 * `./desktop-overlay` window module — that one must stay dynamically imported
 * so its chunk can be split out (avoids INEFFECTIVE_DYNAMIC_IMPORT).
 */
export function isDesktopOverlayEnabled(): boolean {
  return env.KITSUNE_DESKTOP_OVERLAY === '1'
}
