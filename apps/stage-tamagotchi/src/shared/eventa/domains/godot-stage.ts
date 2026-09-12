// Domain: godot-stage — eventa IPC 契约按域拆分
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@kitsune/stage-shared/godot-stage'
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export type ElectronGodotStageState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

/**
 * Snapshot of the Godot sidecar lifecycle owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to reflect whether the external Godot window is available
 * - Settings or stage pages need lifecycle feedback after start/stop actions
 *
 * Expects:
 * - `pid` is only set while the Godot child process exists
 * - `lastError` is present for the most recent lifecycle or scene-apply failure
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageStatus {
  state: ElectronGodotStageState
  pid: number | null
  lastError?: string
  updatedAt: number
}

/**
 * Serialized scene input payload forwarded from renderer to Electron main.
 *
 * Use when:
 * - The selected model should be materialized to disk and applied to the Godot scene
 *
 * Expects:
 * - `data` contains the full model file bytes
 * - `fileName` matches the original model asset name when available
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageSceneInputPayload {
  modelId: string
  format: 'vrm'
  name: string
  fileName: string
  data: Uint8Array
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:start')
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:stop')
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:get-status')
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>('eventa:invoke:electron:godot-stage:apply-scene-input')
export const electronGodotStageGetViewSnapshot = defineInvokeEventa<StageViewSnapshotPayload | null>('eventa:invoke:electron:godot-stage:view-snapshot:get')
export const electronGodotStageApplyViewPatch = defineInvokeEventa<StageViewRequestAckPayload, StageViewPatch>('eventa:invoke:electron:godot-stage:view-state:apply-patch')
export const electronGodotStageRequestViewSnapshot = defineInvokeEventa<StageViewRequestAckPayload>('eventa:invoke:electron:godot-stage:view-state:request-snapshot')
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>('eventa:event:electron:godot-stage:status-changed')
export const electronGodotStageViewSnapshotChanged = defineEventa<StageViewSnapshotPayload>('eventa:event:electron:godot-stage:view-snapshot-changed')
export const electronGodotStageViewStateError = defineEventa<StageViewErrorPayload>('eventa:event:electron:godot-stage:view-state-error')

// Global shortcut ->

/**
 * Phase of a shortcut trigger event.
 *
 * - `down` — key combination pressed
 * - `up`   — key combination released; only emitted by drivers that
 *            accepted a binding with `receiveKeyUps: true`
 */
