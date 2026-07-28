import type { ModelSettingsRuntimeSnapshot } from '@kitsune/stage-ui/components'

export const modelSettingsRuntimeSnapshotChannelName = 'kitsune-model-settings-runtime-snapshot'

export type ModelSettingsRuntimeChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ModelSettingsRuntimeSnapshot }
    | { type: 'owner-gone', ownerInstanceId: string }
