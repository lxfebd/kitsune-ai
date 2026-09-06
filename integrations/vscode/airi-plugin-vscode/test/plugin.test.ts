import { describe, expect, it, vi } from 'vitest'

import { defineKit } from '@kitsune/plugin-sdk'
import { ExtensionHost } from '@kitsune/plugin-sdk/plugin-host'
import plugin, { vscodeContextKitId, vscodeContextModuleId } from '../src/index'

function manifest(permissions: Record<string, unknown> = {}) {
  return {
    apiVersion: 'v1',
    kind: 'manifest.extension.kitsune.ai' as const,
    id: 'kitsune-plugin-vscode',
    permissions,
    entrypoints: {},
  }
}

describe('kitsune-plugin-vscode (airi-plugin-vscode)', () => {
  it('is a defineExtension with the stable id', () => {
    expect(plugin.id).toBe('kitsune-plugin-vscode')
    expect(typeof plugin.setup).toBe('function')
  })

  it('stays idle on a host without the vscode-context kit', async () => {
    const host = new ExtensionHost()
    const session = await host.startExtension(plugin, { manifest: manifest() })
    expect(session.extension.id).toBe('kitsune-plugin-vscode')
    // No kit -> tryUse resolves { ok: false }; no binding, no modules.
    expect(host.listModules()).toEqual([])
  })

  it('announces a vscode-context binding when the host provides the kit', async () => {
    const host = new ExtensionHost()
    const announced = vi.fn(async () => ({ moduleId: vscodeContextModuleId }))
    host.registerKitApi(
      defineKit({
        id: vscodeContextKitId,
        version: '1.0.0',
        createClient: () => ({ announce: announced }),
      }),
    )

    const session = await host.startExtension(plugin, {
      manifest: manifest({
        apis: [{ key: vscodeContextKitId, actions: ['invoke'] }],
      }),
    })
    expect(session.extension.id).toBe('kitsune-plugin-vscode')
    expect(announced).toHaveBeenCalledTimes(1)
    const input = announced.mock.calls[0][0] as { moduleId: string, kitId: string, kitModuleType: string, config: { state: string } }
    expect(input.moduleId).toBe(vscodeContextModuleId)
    expect(input.kitId).toBe(vscodeContextKitId)
    expect(input.config.state).toBe('connected')
  })
})
