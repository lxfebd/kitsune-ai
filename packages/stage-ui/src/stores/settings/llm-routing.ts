import type { ProviderSourceDeployment } from '../../libs/providers/source-metadata'

import { useLocalStorageManualReset } from '@kitsune/stage-shared/composables'
import { defineStore } from 'pinia'
import { v4 as uuid } from 'uuid'

export interface LlmRoutingCondition {
  /** Minimum character count to trigger this rule. */
  minLength?: number
  /** Maximum character count to trigger this rule. */
  maxLength?: number
  /** If any of these keywords appear in the message, trigger this rule. */
  keywords?: string[]
  /** Trigger if the message contains code blocks (``` or indented code). */
  codeBlock?: boolean
  /** Trigger if the message requires tool calling (detected by presence of tool-related keywords). */
  toolCall?: boolean
}

export interface LlmRoutingRule {
  id: string
  name: string
  enabled: boolean
  conditions: LlmRoutingCondition
  target: ProviderSourceDeployment
  priority: number
}

export interface LlmRoutingConfig {
  enabled: boolean
  rules: LlmRoutingRule[]
}

function createDefaultRules(): LlmRoutingRule[] {
  return [
    {
      id: uuid(),
      name: 'Short messages → Local',
      enabled: true,
      conditions: { maxLength: 50 },
      target: 'local',
      priority: 0,
    },
    {
      id: uuid(),
      name: 'Long messages → Cloud',
      enabled: true,
      conditions: { minLength: 200 },
      target: 'cloud',
      priority: 1,
    },
    {
      id: uuid(),
      name: 'Code blocks → Cloud',
      enabled: true,
      conditions: { codeBlock: true },
      target: 'cloud',
      priority: 2,
    },
    {
      id: uuid(),
      name: 'Tool keywords → Cloud',
      enabled: true,
      conditions: { toolCall: true },
      target: 'cloud',
      priority: 3,
    },
  ]
}

export const useSettingsLlmRouting = defineStore('settings-llm-routing', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/llm-routing/enabled', false)
  const rules = useLocalStorageManualReset<LlmRoutingRule[]>('settings/llm-routing/rules', createDefaultRules())

  function addRule(rule: Omit<LlmRoutingRule, 'id'>) {
    rules.value = [...rules.value, { ...rule, id: uuid() }]
  }

  function updateRule(id: string, patch: Partial<LlmRoutingRule>) {
    rules.value = rules.value.map(r => r.id === id ? { ...r, ...patch } : r)
  }

  function removeRule(id: string) {
    rules.value = rules.value.filter(r => r.id !== id)
  }

  function toggleRule(id: string) {
    rules.value = rules.value.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
  }

  function resetState() {
    enabled.reset()
    rules.reset()
  }

  return {
    enabled,
    rules,
    addRule,
    updateRule,
    removeRule,
    toggleRule,
    resetState,
  }
})
