<script setup lang="ts">
import type { LlmRoutingCondition, LlmRoutingRule } from '@kitsune/stage-ui/stores/settings/llm-routing'

import { useSettingsLlmRouting } from '@kitsune/stage-ui/stores/settings'
import { Button } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const settingsRouting = useSettingsLlmRouting()
const { enabled, rules } = storeToRefs(settingsRouting)
const { t } = useI18n()

const editingRule = ref<Partial<LlmRoutingRule> | null>(null)
const isAdding = ref(false)

function startAddRule() {
  editingRule.value = {
    name: '',
    enabled: true,
    conditions: { minLength: 0 },
    target: 'cloud',
    priority: rules.value.length,
  }
  isAdding.value = true
}

function startEditRule(rule: LlmRoutingRule) {
  editingRule.value = { ...rule, conditions: { ...rule.conditions } }
  isAdding.value = false
}

function saveRule() {
  if (!editingRule.value?.name)
    return

  if (isAdding.value) {
    settingsRouting.addRule(editingRule.value as Omit<LlmRoutingRule, 'id'>)
  }
  else if (editingRule.value.id) {
    settingsRouting.updateRule(editingRule.value.id, editingRule.value)
  }
  editingRule.value = null
}

function cancelEdit() {
  editingRule.value = null
}

function deleteRule(id: string) {
  settingsRouting.removeRule(id)
}

const targetOptions = [
  { value: 'local', labelKey: 'settings.pages.modules.llm-routing.local' },
  { value: 'cloud', labelKey: 'settings.pages.modules.llm-routing.cloud' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between py-3">
      <div>
        <h4 class="mb-1 text-sm font-semibold">{{ t('settings.pages.modules.llm-routing.title') }}</h4>
        <p class="m-0 text-xs text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.description') }}</p>
      </div>
      <label class="relative inline-block w-11 h-6">
        <input v-model="enabled" type="checkbox" class="opacity-0 w-0 h-0 peer" />
        <span class="absolute cursor-pointer inset-0 rounded-2xl transition bg-neutral-300 dark:bg-neutral-600 peer-checked:bg-primary-500 before:content-[''] before:absolute before:h-[18px] before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-white before:rounded-full before:transition before:peer-checked:translate-x-5" />
      </label>
    </div>

    <div v-if="enabled" class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h4 class="m-0 text-sm font-semibold">{{ t('settings.pages.modules.llm-routing.routing-rules') }}</h4>
        <Button size="sm" @click="startAddRule">
          {{ t('settings.pages.modules.llm-routing.add-rule') }}
        </Button>
      </div>

      <div class="flex flex-col gap-2">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="p-3 rounded-lg transition-opacity border border-black/[0.06] dark:border-white/[0.06]"
          :class="{ 'opacity-50': !rule.enabled }"
        >
          <div class="flex items-center gap-3">
            <label class="relative inline-block w-9 h-5">
              <input
                :checked="rule.enabled"
                type="checkbox"
                class="opacity-0 w-0 h-0 peer"
                @change="settingsRouting.toggleRule(rule.id)"
              />
              <span class="absolute cursor-pointer inset-0 rounded-2xl transition bg-neutral-300 dark:bg-neutral-600 peer-checked:bg-primary-500 before:content-[''] before:absolute before:h-3.5 before:w-3.5 before:left-[3px] before:bottom-[3px] before:bg-white before:rounded-full before:transition before:peer-checked:translate-x-4" />
            </label>
            <div class="flex-1 flex items-center gap-2">
              <span class="font-medium text-[13px]">{{ rule.name }}</span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">→ {{ rule.target }}</span>
            </div>
            <div class="flex gap-1">
              <Button size="sm" variant="ghost" @click="startEditRule(rule)">
                {{ t('settings.pages.modules.llm-routing.edit') }}
              </Button>
              <Button size="sm" variant="ghost" class="text-red-500" @click="deleteRule(rule.id)">
                {{ t('settings.pages.modules.llm-routing.delete') }}
              </Button>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5 mt-2 pl-12">
            <span v-if="rule.conditions.minLength != null" class="text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.min-length') }} {{ rule.conditions.minLength }} {{ t('settings.pages.modules.llm-routing.chars') }}</span>
            <span v-if="rule.conditions.maxLength != null" class="text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.max-length') }} {{ rule.conditions.maxLength }} {{ t('settings.pages.modules.llm-routing.chars') }}</span>
            <span v-if="rule.conditions.codeBlock" class="text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.code-blocks') }}</span>
            <span v-if="rule.conditions.toolCall" class="text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.tool-keywords') }}</span>
            <span v-if="rule.conditions.keywords?.length" class="text-[11px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400">{{ t('settings.pages.modules.llm-routing.keywords-label') }}: {{ rule.conditions.keywords.join(', ') }}</span>
          </div>
        </div>
      </div>

      <!-- Edit/Add Dialog -->
      <div v-if="editingRule" class="p-4 rounded-lg flex flex-col gap-3 border border-primary-500">
        <h4 class="m-0 text-sm font-semibold">{{ isAdding ? t('settings.pages.modules.llm-routing.add-rule') : t('settings.pages.modules.llm-routing.edit-rule') }}</h4>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.rule-name') }}</label>
          <input v-model="editingRule.name" type="text" class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500" :placeholder="t('settings.pages.modules.llm-routing.rule-name-placeholder')" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.target') }}</label>
          <select v-model="editingRule.target" class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500">
            <option v-for="opt in targetOptions" :key="opt.value" :value="opt.value">
              {{ t(opt.labelKey) }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.min-length') }}</label>
          <input v-model.number="editingRule.conditions!.minLength" type="number" min="0" class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500" :placeholder="t('settings.pages.modules.llm-routing.no-min')" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.max-length') }}</label>
          <input v-model.number="editingRule.conditions!.maxLength" type="number" min="0" class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500" :placeholder="t('settings.pages.modules.llm-routing.no-max')" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
            <input v-model="editingRule.conditions!.codeBlock" type="checkbox" />
            {{ t('settings.pages.modules.llm-routing.match-code-blocks') }}
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
            <input v-model="editingRule.conditions!.toolCall" type="checkbox" />
            {{ t('settings.pages.modules.llm-routing.match-tool-keywords') }}
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.keywords') }}</label>
          <input
            :value="editingRule.conditions!.keywords?.join(', ')"
            type="text"
            class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500"
            :placeholder="t('settings.pages.modules.llm-routing.keywords-placeholder')"
            @input="editingRule.conditions!.keywords = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-medium text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">{{ t('settings.pages.modules.llm-routing.priority') }}</label>
          <input v-model.number="editingRule.priority" type="number" min="0" class="py-1.5 px-2.5 rounded-md text-[13px] border border-neutral-300 dark:border-neutral-600 outline-none transition-colors focus:border-primary-500" />
        </div>
        <div class="flex gap-2 mt-1">
          <Button size="sm" @click="saveRule">
            {{ t('settings.pages.modules.llm-routing.save') }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancelEdit">
            {{ t('settings.pages.modules.llm-routing.cancel') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>


<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.llm-routing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
