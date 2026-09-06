import type { ProviderSourceDeployment } from '../libs/providers/source-metadata'
import type { LlmRoutingCondition, LlmRoutingRule } from './settings/llm-routing'

import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useAnalytics } from '../composables'

import { useProvidersStore } from './providers'
import { useSettingsLlmRouting } from './settings/llm-routing'

const CODE_BLOCK_PATTERNS = [
  /```[\s\S]*?```/m,       // fenced code blocks
  /^    \S/m,              // 4-space indented code
  /^\t\S/m,                // tab-indented code
]

const TOOL_KEYWORDS = [
  'function', 'class', 'import', 'export', 'const ', 'let ', 'var ',
  'def ', 'return ', 'if (', 'for (', 'while (', 'switch (',
  'SELECT ', 'INSERT ', 'UPDATE ', 'DELETE ',
  'curl ', 'wget ', 'git ', 'npm ', 'pip ',
  'calculate', 'compute', 'solve', 'equation', 'formula',
  'debug', 'fix error', 'stack trace', 'traceback',
]

function matchesCondition(text: string, condition: LlmRoutingCondition): boolean {
  if (condition.minLength != null && text.length < condition.minLength)
    return false
  if (condition.maxLength != null && text.length > condition.maxLength)
    return false

  if (condition.codeBlock) {
    const hasCode = CODE_BLOCK_PATTERNS.some(p => p.test(text))
    if (!hasCode)
      return false
  }

  if (condition.keywords?.length) {
    const lower = text.toLowerCase()
    const hasKeyword = condition.keywords.some(kw => lower.includes(kw.toLowerCase()))
    if (!hasKeyword)
      return false
  }

  if (condition.toolCall) {
    const lower = text.toLowerCase()
    const hasTool = TOOL_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))
    if (!hasTool)
      return false
  }

  return true
}

function evaluateRules(text: string, rules: LlmRoutingRule[]): LlmRoutingRule | undefined {
  const sorted = [...rules]
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority)

  return sorted.find(rule => matchesCondition(text, rule.conditions))
}

export interface LlmRouteDecision {
  providerId: string
  model: string
  target: ProviderSourceDeployment
  triggeredRule?: string
}

export const useLlmRouter = defineStore('llm-router', () => {
  const settingsRouting = useSettingsLlmRouting()
  const providersStore = useProvidersStore()
  const { trackModelSwitched } = useAnalytics()

  const { enabled, rules } = storeToRefs(settingsRouting)

  /** Last route decision, used by LLM store for fallback logic. */
  const lastDecision = ref<LlmRouteDecision | null>(null)

  /**
   * Resolve which provider and model to use for a given message text.
   *
   * Decision flow:
   * 1. If routing is disabled, return current activeProvider/activeModel.
   * 2. Evaluate rules against the message text.
   * 3. If a rule matches with target 'local' and current provider is already local → use current.
   * 4. If a rule matches with target 'cloud' and current provider is already cloud → use current.
   * 5. If a rule matches with a different target → find an appropriate provider of that target type.
   */
  function resolve(text: string, currentProviderId: string, currentModel: string): LlmRouteDecision {
    if (!enabled.value) {
      const disabledDecision = {
        providerId: currentProviderId,
        model: currentModel,
        target: getDeployment(currentProviderId) ?? 'cloud',
      }
      lastDecision.value = disabledDecision
      return disabledDecision
    }

    const matchedRule = evaluateRules(text, rules.value)
    const currentDeployment = getDeployment(currentProviderId)

    // No rule matched or current provider already matches the target
    if (!matchedRule || matchedRule.target === currentDeployment) {
      const noChangeDecision = {
        providerId: currentProviderId,
        model: currentModel,
        target: currentDeployment ?? 'cloud',
        triggeredRule: matchedRule?.id,
      }
      lastDecision.value = noChangeDecision
      return noChangeDecision
    }

    // Need to find a provider of the target deployment type
    const targetProvider = findProviderByDeployment(matchedRule.target)
    if (targetProvider) {
      const targetDecision = {
        providerId: targetProvider.id,
        model: targetProvider.model,
        target: matchedRule.target,
        triggeredRule: matchedRule.id,
      }
      lastDecision.value = targetDecision

      // Track the auto-switch
      trackModelSwitched(
        `${currentProviderId}/${currentModel}`,
        `${targetProvider.id}/${targetProvider.model}`,
        'auto',
      )

      return targetDecision
    }

    // No provider of the target type available, fall back to current
    const fallbackDecision = {
      providerId: currentProviderId,
      model: currentModel,
      target: currentDeployment ?? 'cloud',
      triggeredRule: matchedRule?.id,
    }
    lastDecision.value = fallbackDecision
    return fallbackDecision
  }

  function getDeployment(providerId: string): ProviderSourceDeployment | undefined {
    const metadata = providersStore.providerMetadata[providerId]
    return metadata?.deployment
  }

  function findProviderByDeployment(deployment: ProviderSourceDeployment): { id: string, model: string } | undefined {
    const providerMeta = providersStore.providerMetadata
    const runtimeState = providersStore.providerRuntimeState

    for (const [id, meta] of Object.entries(providerMeta)) {
      if (meta.deployment !== deployment)
        continue
      if (!runtimeState[id]?.isConfigured)
        continue
      if (runtimeState[id]?.models?.length) {
        return { id, model: runtimeState[id].models[0].id }
      }
      // Provider is configured but has no models listed (e.g. custom endpoint)
      return { id, model: '' }
    }

    return undefined
  }

  /**
   * Find a cloud fallback provider for when the current (local) provider fails.
   * Returns the first configured cloud provider, or undefined if none available.
   */
  function findCloudFallback(excludeProviderId?: string): { providerId: string, model: string } | undefined {
    const providerMeta = providersStore.providerMetadata
    const runtimeState = providersStore.providerRuntimeState

    for (const [id, meta] of Object.entries(providerMeta)) {
      if (meta.deployment !== 'cloud')
        continue
      if (id === excludeProviderId)
        continue
      if (!runtimeState[id]?.isConfigured)
        continue
      if (runtimeState[id]?.models?.length) {
        return { providerId: id, model: runtimeState[id].models[0].id }
      }
      return { providerId: id, model: '' }
    }

    return undefined
  }

  return {
    enabled,
    rules,
    lastDecision,
    resolve,
    findCloudFallback,
    findProviderByDeployment,
    getDeployment,
  }
})
