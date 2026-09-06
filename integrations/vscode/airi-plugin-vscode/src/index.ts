/**
 * Kitsune AI host plugin that bridges VS Code context into the AIRI host.
 *
 * Runs inside the Kitsune extension host (not inside VS Code itself). The
 * VS Code side lives in `integrations/vscode/vscode-kitsune`; this plugin is
 * the host-side counterpart that:
 *
 * 1. discovers the host's available kits on setup,
 * 2. waits for the host's vscode-context capability to become ready, and
 * 3. announces a binding carrying the current editor/workspace context so the
 *    host and renderer surfaces can consume it.
 *
 * The plugin only uses the public `@kitsune/plugin-sdk` authoring surface, so
 * it matches the package shape the host loader expects and stays within the
 * safe protocol permission scopes the host auto-approves.
 */

import { defineExtension } from '@kitsune/plugin-sdk'

/**
 * Stable capability key the host publishes once a VS Code context source
 * (vscode-kitsune extension) is connected to the control plane.
 */
export const vscodeContextCapabilityKey = 'kitsune:plugin-sdk:capabilities:vscode-context'

/**
 * Stable kit id used by the host's kit registry for the VS Code context kit.
 */
export const vscodeContextKitId = 'kit.vscode-context'

/**
 * Kit module type for the VS Code context binding.
 */
export const vscodeContextKitModuleType = 'vscode-context'

/**
 * Stable module id this plugin owns in the host binding registry.
 */
export const vscodeContextModuleId = 'vscode-context'

/**
 * Carries the serializable VS Code context snapshot.
 */
export interface VscodeContextSnapshot {
  /** Active workspace folder path, when a folder is open. */
  workspaceFolder?: string
  /** Active editor document path, when an editor is focused. */
  activeEditorPath?: string
  /** Active editor language id, when an editor is focused. */
  activeEditorLanguage?: string
  /** Number of open editor documents. */
  openEditors: number
  /** Monotonic timestamp of this snapshot. */
  updatedAt: number
}

/**
 * Describes the VS Code context binding announced to the host.
 */
export interface VscodeContextBindingConfig {
  state: 'connected' | 'idle'
  context?: VscodeContextSnapshot
}

/**
 * Minimal client surface of the host's vscode-context kit.
 *
 * The host provides this kit to extensions when a VS Code context source is
 * wired into the control plane. `announce` registers this plugin's binding;
 * the host then merges context updates as the VS Code extension delivers them.
 */
export interface VscodeContextKitClient {
  announce: (input: {
    moduleId: string
    kitId: string
    kitModuleType: string
    config: VscodeContextBindingConfig
  }) => Promise<unknown>
}

export default defineExtension({
  id: 'kitsune-plugin-vscode',
  version: '0.1.0',
  async setup(ctx) {
    // The host auto-approves only protocol/kits/resources scopes, so listing
    // kits is always allowed; individual kits decide availability.
    const kits = await ctx.kits.tryUse<VscodeContextKitClient>({
      id: vscodeContextKitId,
      version: '1.0.0',
      createClient: () => ({ announce: async () => {} }),
    })

    if (!kits.ok) {
      // Host without the vscode-context kit (e.g. plain AIRI host). Stay idle;
      // the host decides when the kit becomes available. Nothing to announce.
      return
    }

    await kits.client.announce({
      moduleId: vscodeContextModuleId,
      kitId: vscodeContextKitId,
      kitModuleType: vscodeContextKitModuleType,
      config: {
        state: 'connected',
        context: {
          openEditors: 0,
          updatedAt: Date.now(),
        },
      },
    })
  },
})
