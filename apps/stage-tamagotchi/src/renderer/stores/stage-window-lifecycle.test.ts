import { describe, expect, it } from 'vitest'

import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createDefaultWindowLifecycleState, shouldLowPowerStageFromLifecycle, shouldPauseStageFromLifecycle } from './stage-window-lifecycle'

describe('stage window lifecycle helpers', () => {
  it('pauses only for hidden or minimized window lifecycle states', () => {
    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'show',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'restore',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'hide',
      visible: false,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      minimized: true,
      reason: 'minimize',
    })).toBe(true)
  })

  it('enters low-power only when the window is visible but blurred', () => {
    // 聚焦且未最小化：正常渲染，不进低功耗
    expect(shouldLowPowerStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      focused: true,
    })).toBe(false)

    // 最小化：已暂停（stagePaused），不叠加低功耗
    expect(shouldLowPowerStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      focused: false,
      minimized: true,
      reason: 'minimize',
    })).toBe(false)

    // 失焦但可见（常驻桌面角落、用户在操作其他应用）：低功耗降帧
    expect(shouldLowPowerStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      focused: false,
      reason: 'blur',
    })).toBe(true)
  })

  it('samples stage transparency only for mounted vrm stage while fade-on-hover is active', () => {
    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(true)

    expect(shouldSampleStageTransparency({
      componentState: 'loading',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: false,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'live2d',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: true,
    })).toBe(false)
  })
})
