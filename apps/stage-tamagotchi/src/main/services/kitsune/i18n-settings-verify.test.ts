/**
 * 设置页 i18n key 解析验证 — 防止 key 原文泄漏回 UI（settings.yaml 段名错位回归）。
 * 模拟 renderer 实际解析路径：messages.settings.<...>。
 */
import { describe, expect, it } from 'vitest'
import messages from '@kitsune/i18n/locales'

const zh = messages['zh-Hans'] as any
const en = messages['en'] as any

function resolve(msgs: any, key: string): unknown {
  const inner = key.replace(/^settings\./, '')
  return inner.split('.').reduce((cur: any, p: string) => (cur == null ? undefined : cur[p]), msgs.settings)
}

describe('settings i18n key resolution (regression: raw keys shown in UI)', () => {
  it('group descriptions resolve (was settings-groups mismatch)', () => {
    for (const k of ['settings.groups.pet.description', 'settings.groups.senses.description', 'settings.groups.run.description', 'settings.groups.security.description', 'settings.groups.ops.description', 'settings.groups.not-found']) {
      const v = resolve(zh, k)
      expect(typeof v, `${k} should resolve in zh-Hans`).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
      expect(resolve(en, k), `${k} should resolve in en`).toBeTruthy()
    }
  })

  it('card descriptions resolve', () => {
    for (const id of ['system', 'scene', 'modules', 'data', 'account', 'kitsune-card', 'models', 'speech', 'hearing', 'connection', 'director', 'executor', 'overseer', 'environment', 'whitelist', 'connectors', 'mcp-agent', 'sidecar', 'health']) {
      const k = `settings.groups.cards.${id}.description`
      expect(typeof resolve(zh, k), `${k} zh`).toBe('string')
      expect(resolve(en, k), `${k} en`).toBeTruthy()
    }
  })

  it('nav group labels resolve', () => {
    for (const id of ['pet', 'senses', 'run', 'security', 'ops']) {
      const k = `settings.nav.group.${id}`
      expect(typeof resolve(zh, k), `${k} zh`).toBe('string')
      expect(resolve(en, k), `${k} en`).toBeTruthy()
    }
  })

  it('mcp-agent page keys resolve under environment.mcp-agent (tmc prefix)', () => {
    for (const k of ['title', 'description', 'intro', 'http-url-label', 'http-url-hint', 'mode.url', 'mode.stdio', 'mode-hint.url', 'mode-hint.stdio', 'config-file-label', 'config-paths-label', 'packaged-entry-hint', 'copy', 'copied', 'copy-failed', 'copy-hint']) {
      const full = `settings.pages.environment.mcp-agent.${k}`
      expect(typeof resolve(zh, full), `${full} zh`).toBe('string')
      expect(resolve(en, full), `${full} en`).toBeTruthy()
    }
  })

  it('environment page keys resolve', () => {
    for (const k of ['settings.pages.environment.title', 'settings.pages.environment.description']) {
      expect(typeof resolve(zh, k)).toBe('string')
      expect(resolve(en, k)).toBeTruthy()
    }
  })

  it('overseer guidance page keys resolve (tn prefix)', () => {
    for (const k of ['settings.pages.environment.overseer.guidance.title', 'settings.pages.environment.overseer.guidance.description', 'settings.pages.environment.overseer.guidance.enable-label', 'settings.pages.environment.overseer.guidance.enable', 'settings.pages.environment.overseer.guidance.disable', 'settings.pages.environment.overseer.guidance.reset', 'settings.pages.environment.overseer.guidance.reset-busy', 'settings.pages.environment.overseer.guidance.records-count', 'settings.pages.environment.overseer.guidance.empty-records']) {
      expect(typeof resolve(zh, k), `${k} zh`).toBe('string')
      expect((resolve(zh, k) as string).length, `${k} zh non-empty`).toBeGreaterThan(0)
      expect(resolve(en, k), `${k} en`).toBeTruthy()
    }
  })
})
