/**
 * RouteConfig 测试
 *
 * 测试事件路由规则、风险等级定义
 */

import { describe, it, expect } from 'vitest'
import { RISK_LEVELS, EVENT_RULES } from './routeConfig.js'

describe('RouteConfig', () => {
  describe('RISK_LEVELS', () => {
    it('should have low risk level', () => {
      expect(RISK_LEVELS.low).toBeDefined()
      expect(RISK_LEVELS.low.autoExecute).toBe(true)
      expect(RISK_LEVELS.low.notify).toBe(false)
      expect(RISK_LEVELS.low.label).toBe('低风险')
    })

    it('should have medium risk level', () => {
      expect(RISK_LEVELS.medium).toBeDefined()
      expect(RISK_LEVELS.medium.autoExecute).toBe(true)
      expect(RISK_LEVELS.medium.notify).toBe(true)
      expect(RISK_LEVELS.medium.label).toBe('中风险')
    })

    it('should have high risk level', () => {
      expect(RISK_LEVELS.high).toBeDefined()
      expect(RISK_LEVELS.high.autoExecute).toBe(false)
      expect(RISK_LEVELS.high.notify).toBe(true)
      expect(RISK_LEVELS.high.label).toBe('高风险')
    })
  })

  describe('EVENT_RULES', () => {
    it('should be an array', () => {
      expect(Array.isArray(EVENT_RULES)).toBe(true)
      expect(EVENT_RULES.length).toBeGreaterThan(0)
    })

    it('should have valid structure for each rule', () => {
      EVENT_RULES.forEach((rule, index) => {
        expect(rule.source).toBeDefined()
        expect(typeof rule.source).toBe('string')
        expect(rule.activity).toBeDefined()
        expect(typeof rule.activity).toBe('string')
        expect(rule.risk).toBeDefined()
        expect(['low', 'medium', 'high']).toContain(rule.risk)
        expect(rule.action).toBeDefined()
        expect(typeof rule.action).toBe('string')
        expect(rule.description).toBeDefined()
        expect(typeof rule.description).toBe('string')
      })
    })

    it('should have rules for Claude Code', () => {
      const claudeRules = EVENT_RULES.filter(r => r.source === 'claude_code')
      expect(claudeRules.length).toBeGreaterThan(0)
    })

    it('should have rules for Trae', () => {
      const traeRules = EVENT_RULES.filter(r => r.source === 'trae')
      expect(traeRules.length).toBeGreaterThan(0)
    })

    it('should have rules for generic tools', () => {
      const genericRules = EVENT_RULES.filter(r => r.source === 'generic')
      expect(genericRules.length).toBeGreaterThan(0)
    })

    it('should map error activities to medium or high risk', () => {
      const errorRules = EVENT_RULES.filter(r => r.activity === 'error')
      errorRules.forEach(rule => {
        expect(['medium', 'high']).toContain(rule.risk)
      })
    })

    it('should map completed activities to low risk', () => {
      const completedRules = EVENT_RULES.filter(r => r.activity === 'completed')
      completedRules.forEach(rule => {
        expect(rule.risk).toBe('low')
      })
    })

    it('should have unique source-activity combinations', () => {
      const combinations = EVENT_RULES.map(r => `${r.source}:${r.activity}`)
      const uniqueCombinations = new Set(combinations)
      expect(combinations.length).toBe(uniqueCombinations.size)
    })
  })
})
