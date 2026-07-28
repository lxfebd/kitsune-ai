/**
 * ActivityStates 测试
 *
 * 测试统一活动状态枚举、状态映射
 */

import { describe, it, expect } from 'vitest'
import {
  STATE,
  REVIEWABLE_STATES,
  ROUTABLE_STATES,
  NOTIFYABLE_STATES,
  mapToUnifiedState,
} from './activityStates.js'

describe('ActivityStates', () => {
  describe('STATE enum', () => {
    it('should have all required states', () => {
      expect(STATE.IDLE).toBe('idle')
      expect(STATE.THINKING).toBe('thinking')
      expect(STATE.CODING).toBe('coding')
      expect(STATE.EXECUTING).toBe('executing')
      expect(STATE.BUILDING).toBe('building')
      expect(STATE.TESTING).toBe('testing')
      expect(STATE.COMPLETED).toBe('completed')
      expect(STATE.ERROR).toBe('error')
      expect(STATE.STOPPED).toBe('stopped')
      expect(STATE.CODE_CHANGED).toBe('code_changed')
    })
  })

  describe('REVIEWABLE_STATES', () => {
    it('should contain states that trigger code review', () => {
      expect(REVIEWABLE_STATES.has(STATE.THINKING)).toBe(true)
      expect(REVIEWABLE_STATES.has(STATE.CODING)).toBe(true)
      expect(REVIEWABLE_STATES.has(STATE.COMPLETED)).toBe(true)
      expect(REVIEWABLE_STATES.has(STATE.ERROR)).toBe(true)
    })

    it('should not contain IDLE', () => {
      expect(REVIEWABLE_STATES.has(STATE.IDLE)).toBe(false)
    })
  })

  describe('ROUTABLE_STATES', () => {
    it('should contain states that trigger auto-routing', () => {
      expect(ROUTABLE_STATES.has(STATE.ERROR)).toBe(true)
      expect(ROUTABLE_STATES.has(STATE.COMPLETED)).toBe(true)
      expect(ROUTABLE_STATES.has(STATE.CODE_CHANGED)).toBe(true)
    })

    it('should not contain THINKING or CODING', () => {
      expect(ROUTABLE_STATES.has(STATE.THINKING)).toBe(false)
      expect(ROUTABLE_STATES.has(STATE.CODING)).toBe(false)
    })
  })

  describe('NOTIFYABLE_STATES', () => {
    it('should only contain ERROR and COMPLETED', () => {
      expect(NOTIFYABLE_STATES.size).toBe(2)
      expect(NOTIFYABLE_STATES.has(STATE.ERROR)).toBe(true)
      expect(NOTIFYABLE_STATES.has(STATE.COMPLETED)).toBe(true)
    })
  })

  describe('mapToUnifiedState', () => {
    it('should map Claude Code states', () => {
      expect(mapToUnifiedState('thinking', 'claude')).toBe(STATE.THINKING)
      expect(mapToUnifiedState('coding', 'claude')).toBe(STATE.CODING)
      expect(mapToUnifiedState('executing', 'claude')).toBe(STATE.EXECUTING)
      expect(mapToUnifiedState('completed', 'claude')).toBe(STATE.COMPLETED)
      expect(mapToUnifiedState('error', 'claude')).toBe(STATE.ERROR)
    })

    it('should map Trae states', () => {
      expect(mapToUnifiedState('compiling', 'trae')).toBe(STATE.BUILDING)
      expect(mapToUnifiedState('build_success', 'trae')).toBe(STATE.COMPLETED)
      expect(mapToUnifiedState('build_error', 'trae')).toBe(STATE.ERROR)
      expect(mapToUnifiedState('editing', 'trae')).toBe(STATE.CODING)
    })

    it('should map generic states', () => {
      expect(mapToUnifiedState('thinking', 'generic')).toBe(STATE.THINKING)
      expect(mapToUnifiedState('coding', 'generic')).toBe(STATE.CODING)
      expect(mapToUnifiedState('editing', 'generic')).toBe(STATE.CODING)
    })

    it('should default to IDLE for unknown states', () => {
      expect(mapToUnifiedState('unknown_state', 'claude')).toBe(STATE.IDLE)
      expect(mapToUnifiedState('unknown_state', 'trae')).toBe(STATE.IDLE)
      expect(mapToUnifiedState('unknown_state', 'generic')).toBe(STATE.IDLE)
    })

    it('should default to generic for unknown monitor types', () => {
      expect(mapToUnifiedState('thinking', 'unknown')).toBe(STATE.THINKING)
      expect(mapToUnifiedState('coding', 'unknown')).toBe(STATE.CODING)
    })
  })
})
