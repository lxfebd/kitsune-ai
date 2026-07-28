<script setup lang="ts">
import type { MemoryEntry, MemoryExtractRule, MemoryExtractRuleCategory, MemorySettings, MemoryStats, MemoryUserProfile } from '../../../../shared/eventa'

import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import {
  Button,
  FieldInput,
  FieldRange,
  FieldSelect,
  FieldTextArea,
  TransitionVertical,
} from '@kitsune/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronMemoryCleanup,
  electronMemoryClearAll,
  electronMemoryExport,
  electronMemoryGetProfile,
  electronMemoryGetRules,
  electronMemoryGetSettings,
  electronMemoryGetStats,
  electronMemoryImport,
  electronMemoryListEntries,
  electronMemoryRemoveEntry,
  electronMemorySetProfile,
  electronMemorySetRules,
  electronMemorySetSettings,
  electronMemoryTestRules,
} from '../../../../shared/eventa'

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-long-term.${key}`, params ?? {})

const invokeGetStats = useElectronEventaInvoke(electronMemoryGetStats)
const invokeListEntries = useElectronEventaInvoke(electronMemoryListEntries)
const invokeRemoveEntry = useElectronEventaInvoke(electronMemoryRemoveEntry)
const invokeCleanup = useElectronEventaInvoke(electronMemoryCleanup)
const invokeClearAll = useElectronEventaInvoke(electronMemoryClearAll)
const invokeExport = useElectronEventaInvoke(electronMemoryExport)
const invokeImport = useElectronEventaInvoke(electronMemoryImport)
const invokeGetSettings = useElectronEventaInvoke(electronMemoryGetSettings)
const invokeSetSettings = useElectronEventaInvoke(electronMemorySetSettings)
const invokeGetProfile = useElectronEventaInvoke(electronMemoryGetProfile)
const invokeSetProfile = useElectronEventaInvoke(electronMemorySetProfile)
const invokeGetRules = useElectronEventaInvoke(electronMemoryGetRules)
const invokeSetRules = useElectronEventaInvoke(electronMemorySetRules)
const invokeTestRules = useElectronEventaInvoke(electronMemoryTestRules)

const activeTab = ref<'overview' | 'profile' | 'entries' | 'rules' | 'settings'>('overview')

// Overview
const stats = ref<MemoryStats>({ totalEntries: 0, totalSizeBytes: 0, lastCleanedAt: null, nextCleanupAt: null })
const cleanupResult = ref<{ removed: number } | null>(null)
const clearing = ref(false)
const exporting = ref(false)
const importing = ref(false)

// Profile
const profile = ref<MemoryUserProfile | null>(null)
const editingProfile = ref(false)
const profileName = ref('')
const profilePrefs = ref<Record<string, string>>({})
const profilePrefKey = ref('')
const profilePrefValue = ref('')

// Entries
const entries = ref<MemoryEntry[]>([])
const loadingEntries = ref(false)
const searchQuery = ref('')
const filterType = ref('all')
const selectedEntry = ref<MemoryEntry | null>(null)
const deletingId = ref<string | null>(null)

// Rules
const rules = ref<MemoryExtractRule[]>([])
const loadingRules = ref(false)
const editingRule = ref<MemoryExtractRule | null>(null)
const showRuleForm = ref(false)
const ruleName = ref('')
const rulePattern = ref('')
const ruleCategory = ref<MemoryExtractRuleCategory>('fact')
const rulePriority = ref(10)
const rulePatternError = ref('')
const testText = ref('')
const testingRules = ref(false)
const testResults = ref<Array<{ ruleId: string, ruleName: string, category: string, priority: number }>>([])

// Settings
const settings = ref<MemorySettings>({
  retentionDays: 90,
  maxEntries: 10000,
  autoCleanup: true,
  autoExtract: true,
  expirationDays: 90,
  retrievalTopK: 5,
  provider: 'local',
  apiKey: '',
})
const savingSettings = ref(false)

const tabs = computed(() => [
  { id: 'overview' as const, label: tn('tabs.overview') },
  { id: 'profile' as const, label: tn('tabs.profile') },
  { id: 'entries' as const, label: tn('tabs.entries') },
  { id: 'rules' as const, label: tn('tabs.rules') },
  { id: 'settings' as const, label: tn('tabs.settings') },
])

const categoryOptions = computed(() => [
  { label: tn('rules.categories.preference'), value: 'preference' },
  { label: tn('rules.categories.fact'), value: 'fact' },
  { label: tn('rules.categories.event'), value: 'event' },
  { label: tn('rules.categories.emotion'), value: 'emotion' },
  { label: tn('rules.categories.other'), value: 'other' },
])

const filterTypeOptions = computed(() => [
  { label: tn('entries.filters.all'), value: 'all' },
  { label: tn('entries.filters.fact'), value: 'fact' },
  { label: tn('entries.filters.preference'), value: 'preference' },
  { label: tn('entries.filters.event'), value: 'event' },
  { label: tn('entries.filters.context'), value: 'context' },
])

const providerOptions = computed(() => [
  { label: tn('settings.providers.local'), value: 'local' },
  { label: tn('settings.providers.mem0'), value: 'mem0' },
])

async function loadStats() {
  const result = await invokeGetStats()
  if (result)
    stats.value = result
}

async function loadEntries() {
  loadingEntries.value = true
  try {
    const result = await invokeListEntries({
      limit: 50,
      q: searchQuery.value,
      type: filterType.value === 'all' ? undefined : filterType.value,
    })
    entries.value = result ?? []
  }
  finally {
    loadingEntries.value = false
  }
}

async function loadProfile() {
  const result = await invokeGetProfile()
  profile.value = result
  if (result) {
    profileName.value = result.name
    profilePrefs.value = { ...result.preferences }
  }
}

async function loadRules() {
  loadingRules.value = true
  try {
    const result = await invokeGetRules()
    rules.value = result ?? []
  }
  finally {
    loadingRules.value = false
  }
}

async function loadSettings() {
  const result = await invokeGetSettings()
  if (result)
    settings.value = result
}

async function handleCleanup() {
  cleanupResult.value = null
  const result = await invokeCleanup()
  if (result) {
    cleanupResult.value = result
  }
  await loadStats()
}

async function handleClearAll() {
  clearing.value = true
  try {
    await invokeClearAll()
    await loadStats()
    await loadEntries()
  }
  finally {
    clearing.value = false
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const result = await invokeExport()
    if (!result)
      return
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `memory-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  finally {
    exporting.value = false
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  importing.value = true
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await invokeImport(data)
    await loadStats()
    await loadEntries()
  }
  finally {
    importing.value = false
    input.value = ''
  }
}

async function handleDeleteEntry(id: string) {
  deletingId.value = id
  try {
    await invokeRemoveEntry({ id })
    await loadEntries()
    await loadStats()
    if (selectedEntry.value?.id === id)
      selectedEntry.value = null
  }
  finally {
    deletingId.value = null
  }
}

async function handleSaveProfile() {
  await invokeSetProfile({ name: profileName.value, preferences: profilePrefs.value })
  await loadProfile()
  editingProfile.value = false
}

function handleAddPref() {
  if (!profilePrefKey.value.trim())
    return
  profilePrefs.value[profilePrefKey.value.trim()] = profilePrefValue.value
  profilePrefKey.value = ''
  profilePrefValue.value = ''
}

function handleRemovePref(key: string) {
  delete profilePrefs.value[key]
}

function openRuleForm(rule?: MemoryExtractRule) {
  editingRule.value = rule ?? null
  ruleName.value = rule?.name ?? ''
  rulePattern.value = rule?.pattern ?? ''
  ruleCategory.value = rule?.category ?? 'fact'
  rulePriority.value = rule?.priority ?? 10
  rulePatternError.value = ''
  showRuleForm.value = true
}

function validatePattern(pattern: string): boolean {
  try {
    const _regex = new RegExp(pattern)
    void _regex
    rulePatternError.value = ''
    return true
  }
  catch (e: any) {
    rulePatternError.value = e.message as string
    return false
  }
}

async function handleSaveRule() {
  if (!ruleName.value.trim() || !rulePattern.value.trim())
    return
  if (!validatePattern(rulePattern.value))
    return
  const rule: MemoryExtractRule = {
    id: editingRule.value?.id ?? `rule_${Date.now()}`,
    name: ruleName.value.trim(),
    pattern: rulePattern.value.trim(),
    category: ruleCategory.value,
    enabled: editingRule.value?.enabled ?? true,
    priority: rulePriority.value,
  }
  if (editingRule.value) {
    const index = rules.value.findIndex(r => r.id === rule.id)
    if (index >= 0)
      rules.value[index] = rule
  }
  else {
    rules.value.push(rule)
  }
  await invokeSetRules({ rules: rules.value })
  await loadRules()
  showRuleForm.value = false
}

async function handleToggleRule(rule: MemoryExtractRule) {
  rule.enabled = !rule.enabled
  await invokeSetRules({ rules: rules.value })
}

async function handleDeleteRule(id: string) {
  rules.value = rules.value.filter(r => r.id !== id)
  await invokeSetRules({ rules: rules.value })
}

async function handleTestRules() {
  if (!testText.value.trim())
    return
  testingRules.value = true
  try {
    const result = await invokeTestRules({ text: testText.value, rules: rules.value })
    testResults.value = result ?? []
  }
  finally {
    testingRules.value = false
  }
}

async function handleSaveSettings() {
  savingSettings.value = true
  try {
    await invokeSetSettings(settings.value)
  }
  finally {
    savingSettings.value = false
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1048576)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(dateStr?: string | null) {
  if (!dateStr)
    return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

watch(activeTab, (tab) => {
  if (tab === 'entries')
    loadEntries()
  else if (tab === 'rules')
    loadRules()
})

watch([searchQuery, filterType], () => {
  loadEntries()
})

onMounted(() => {
  loadStats()
  loadSettings()
  loadProfile()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Tabs -->
    <div class="flex flex-wrap gap-1 rounded-xl bg-white/40 dark:bg-white/[0.03] p-1 border border-black/[0.04] dark:border-white/[0.04]">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
        :class="activeTab === tab.id
          ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Overview -->
    <div v-if="activeTab === 'overview'" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-2xl bg-white/50 dark:bg-white/[0.03] p-4 border border-black/[0.04] dark:border-white/[0.04] transition-all duration-300 hover:shadow-sm">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            {{ tn('overview.total_entries') }}
          </div>
          <div class="text-2xl text-neutral-800 font-bold dark:text-neutral-100">
            {{ stats.totalEntries.toLocaleString() }}
          </div>
        </div>
        <div class="rounded-2xl bg-white/50 dark:bg-white/[0.03] p-4 border border-black/[0.04] dark:border-white/[0.04] transition-all duration-300 hover:shadow-sm">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            {{ tn('overview.total_size') }}
          </div>
          <div class="text-2xl text-neutral-800 font-bold dark:text-neutral-100">
            {{ formatSize(stats.totalSizeBytes) }}
          </div>
        </div>
        <div class="rounded-2xl bg-white/50 dark:bg-white/[0.03] p-4 border border-black/[0.04] dark:border-white/[0.04] transition-all duration-300 hover:shadow-sm">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            {{ tn('overview.last_cleanup') }}
          </div>
          <div class="text-sm text-neutral-700 font-mono dark:text-neutral-300">
            {{ formatDate(stats.lastCleanedAt) }}
          </div>
        </div>
        <div class="rounded-2xl bg-white/50 dark:bg-white/[0.03] p-4 border border-black/[0.04] dark:border-white/[0.04] transition-all duration-300 hover:shadow-sm">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            {{ tn('overview.next_cleanup') }}
          </div>
          <div class="text-sm text-neutral-700 font-mono dark:text-neutral-300">
            {{ formatDate(stats.nextCleanupAt) }}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <Button variant="secondary" :loading="false" @click="handleCleanup">
          {{ tn('overview.cleanup') }}
        </Button>
        <div v-if="cleanupResult" class="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-600 dark:text-green-400">
          {{ tn('overview.cleanup_result', { removed: cleanupResult.removed }) }}
        </div>

        <Button variant="danger" :loading="clearing" @click="handleClearAll">
          {{ tn('overview.clear_all') }}
        </Button>

        <div class="grid grid-cols-2 gap-2">
          <Button variant="secondary" :loading="exporting" @click="handleExport">
            {{ tn('overview.export') }}
          </Button>
          <label class="block flex-1">
            <input type="file" accept=".json" class="hidden" @change="handleImport">
            <Button variant="secondary" :loading="importing" class="w-full">
              {{ tn('overview.import') }}
            </Button>
          </label>
        </div>
      </div>
    </div>

    <!-- Profile -->
    <div v-else-if="activeTab === 'profile'" class="flex flex-col gap-4">
      <div v-if="!editingProfile && profile" class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="text-lg text-neutral-800 font-semibold dark:text-neutral-100">
            {{ profile.name || tn('profile.unnamed') }}
          </div>
          <Button variant="secondary" size="sm" @click="editingProfile = true">
            {{ tn('profile.edit') }}
          </Button>
        </div>
        <div v-if="Object.keys(profile.preferences).length > 0" class="flex flex-col gap-2">
          <div class="text-xs text-neutral-400 font-medium uppercase dark:text-neutral-500">
            {{ tn('profile.preferences') }}
          </div>
          <div v-for="(value, key) in profile.preferences" :key="key" class="flex items-center justify-between rounded-lg bg-white/50 dark:bg-white/[0.04] px-3 py-2 border border-black/[0.04] dark:border-white/[0.04]">
            <span class="text-xs text-neutral-500 font-mono dark:text-neutral-400">{{ key }}</span>
            <span class="text-sm text-neutral-700 dark:text-neutral-300">{{ value }}</span>
          </div>
        </div>
        <div class="text-xs text-neutral-400 dark:text-neutral-500">
          {{ tn('profile.updated_at') }} {{ formatDate(profile.updatedAt) }}
        </div>
      </div>

      <div v-else class="flex flex-col gap-3">
        <FieldInput v-model="profileName" :label="tn('profile.name_label')" :placeholder="tn('profile.name_placeholder')" />
        <div class="flex flex-col gap-2">
          <div class="text-xs text-neutral-400 font-medium dark:text-neutral-500">
            {{ tn('profile.preferences') }}
          </div>
          <div v-for="key in Object.keys(profilePrefs)" :key="key" class="flex items-center gap-2">
            <input :value="key" readonly class="flex-1 rounded-lg bg-white/60 dark:bg-white/[0.04] px-2 py-1 text-xs font-mono">
            <input v-model="profilePrefs[key]" class="flex-1 rounded-lg bg-white/60 dark:bg-white/[0.04] px-2 py-1 text-xs">
            <Button variant="ghost" size="sm" @click="handleRemovePref(key)">
              ×
            </Button>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="profilePrefKey" :placeholder="tn('profile.pref_key_placeholder')" class="flex-1 rounded-lg bg-white/60 dark:bg-white/[0.04] px-2 py-1 text-xs">
            <input v-model="profilePrefValue" :placeholder="tn('profile.pref_value_placeholder')" class="flex-1 rounded-lg bg-white/60 dark:bg-white/[0.04] px-2 py-1 text-xs">
            <Button variant="secondary" size="sm" @click="handleAddPref">
              +
            </Button>
          </div>
        </div>
        <div class="flex gap-2">
          <Button variant="primary" @click="handleSaveProfile">
            {{ tn('profile.save') }}
          </Button>
          <Button variant="secondary" @click="editingProfile = false; loadProfile()">
            {{ tn('profile.cancel') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Entries -->
    <div v-else-if="activeTab === 'entries'" class="flex flex-col gap-3">
      <div class="flex gap-2">
        <FieldInput v-model="searchQuery" :placeholder="tn('entries.search_placeholder')" class="flex-1" />
        <FieldSelect v-model="filterType" :label="tn('entries.filter_type')" :options="filterTypeOptions" />
      </div>
      <div v-if="loadingEntries" class="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
        {{ tn('entries.loading') }}
      </div>
      <div v-else-if="entries.length === 0" class="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">
        {{ tn('entries.empty') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <button
          v-for="entry in entries"
          :key="entry.id"
          class="flex flex-col gap-1 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 text-left transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]"
          :class="selectedEntry?.id === entry.id ? 'border-indigo-500 bg-indigo-500/5' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'"
          @click="selectedEntry = selectedEntry?.id === entry.id ? null : entry"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">
              {{ entry.content }}
            </p>
            <Button
              variant="ghost"
              size="sm"
              :loading="deletingId === entry.id"
              class="!text-red-400 hover:!text-red-500"
              @click.stop="handleDeleteEntry(entry.id)"
            >
              {{ tn('entries.delete') }}
            </Button>
          </div>
          <div class="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <span class="rounded bg-neutral-100/60 dark:bg-white/[0.06] px-1.5 py-0.5">{{ entry.type }}</span>
            <span>{{ formatDate(entry.created_at) }}</span>
          </div>
        </button>
      </div>
      <TransitionVertical v-if="selectedEntry">
        <div class="border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
          <div class="mb-2 text-xs text-neutral-400 font-medium uppercase dark:text-neutral-500">
            {{ tn('entries.detail') }}
          </div>
          <pre class="max-h-60 overflow-auto whitespace-pre-wrap text-xs text-neutral-600 font-mono dark:text-neutral-400">{{ JSON.stringify(selectedEntry, null, 2) }}</pre>
        </div>
      </TransitionVertical>
    </div>

    <!-- Rules -->
    <div v-else-if="activeTab === 'rules'" class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="text-sm text-neutral-500 dark:text-neutral-400">
          {{ tn('rules.title') }}
        </div>
        <Button variant="secondary" size="sm" @click="openRuleForm()">
          {{ tn('rules.add') }}
        </Button>
      </div>
      <div v-if="loadingRules" class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        {{ tn('rules.loading') }}
      </div>
      <div v-else-if="rules.length === 0" class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
        {{ tn('rules.empty') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="rule in rules"
          :key="rule.id"
          class="flex items-start justify-between gap-3 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]"
        >
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="text-sm text-neutral-800 font-medium dark:text-neutral-200">{{ rule.name }}</span>
              <span class="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">{{ rule.category }}</span>
              <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ tn('rules.priority', { value: rule.priority }) }}</span>
            </div>
            <code class="text-xs text-neutral-500 font-mono dark:text-neutral-400">{{ rule.pattern }}</code>
          </div>
          <div class="flex items-center gap-1">
            <input
              type="checkbox"
              :checked="rule.enabled"
              class="accent-indigo-500"
              @change="handleToggleRule(rule)"
            >
            <Button variant="ghost" size="sm" @click="openRuleForm(rule)">
              {{ tn('rules.edit') }}
            </Button>
            <Button variant="ghost" size="sm" class="!text-red-400 hover:!text-red-500" @click="handleDeleteRule(rule.id)">
              {{ tn('rules.delete') }}
            </Button>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
        <div class="text-xs text-neutral-400 font-medium uppercase dark:text-neutral-500">
          {{ tn('rules.test_title') }}
        </div>
        <FieldTextArea v-model="testText" :placeholder="tn('rules.test_placeholder')" />
        <Button variant="secondary" :loading="testingRules" @click="handleTestRules">
          {{ tn('rules.test_button') }}
        </Button>
        <div v-if="testResults.length > 0" class="flex flex-wrap gap-2">
          <span v-for="(result, i) in testResults" :key="i" class="rounded bg-indigo-500/10 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400">
            {{ result.ruleName }}
          </span>
        </div>
        <div v-else-if="testText && !testingRules" class="text-center text-xs text-neutral-400 dark:text-neutral-500">
          {{ tn('rules.no_match') }}
        </div>
      </div>
    </div>

    <!-- Rule Form Dialog -->
    <div v-if="showRuleForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="max-w-md w-full rounded-2xl bg-white/90 dark:bg-neutral-900/90 p-5 shadow-xl backdrop-blur-2xl border border-black/5 dark:border-white/5">
        <div class="mb-4 text-lg text-neutral-800 font-semibold dark:text-neutral-100">
          {{ editingRule ? tn('rules.edit_title') : tn('rules.add_title') }}
        </div>
        <div class="flex flex-col gap-3">
          <FieldInput v-model="ruleName" :label="tn('rules.form.name')" />
          <div>
            <FieldInput v-model="rulePattern" :label="tn('rules.form.pattern')" />
            <div v-if="rulePatternError" class="mt-1 text-xs text-red-500">
              {{ rulePatternError }}
            </div>
          </div>
          <FieldSelect v-model="ruleCategory" :label="tn('rules.form.category')" :options="categoryOptions" />
          <FieldInput v-model.number="rulePriority" type="number" :label="tn('rules.form.priority')" />
          <div class="flex justify-end gap-2">
            <Button variant="secondary" size="sm" @click="showRuleForm = false">
              {{ tn('rules.form.cancel') }}
            </Button>
            <Button variant="primary" size="sm" @click="handleSaveRule">
              {{ tn('rules.form.save') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings -->
    <div v-else-if="activeTab === 'settings'" class="flex flex-col gap-4">
      <div class="rounded-2xl bg-indigo-500/8 p-4 dark:bg-indigo-500/[0.06] border border-indigo-500/10 dark:border-indigo-500/15 transition-all duration-300 hover:shadow-sm hover:shadow-indigo-500/[0.04]">
        <div class="text-sm text-indigo-700 font-medium dark:text-indigo-300">
          {{ tn('settings.basic_title') }}
        </div>
      </div>
      <FieldRange v-model="settings.retentionDays" :label="tn('settings.retention_days')" :min="7" :max="365" :step="1" />
      <FieldRange v-model="settings.expirationDays" :label="tn('settings.expiration_days')" :min="0" :max="365" :step="1" />
      <FieldRange v-model="settings.maxEntries" :label="tn('settings.max_entries')" :min="1000" :max="100000" :step="1000" />
      <div class="flex items-center justify-between rounded-xl bg-white/60 p-3 dark:bg-neutral-800/60">
        <div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {{ tn('settings.auto_cleanup') }}
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ tn('settings.auto_cleanup_desc') }}
          </div>
        </div>
        <input v-model="settings.autoCleanup" type="checkbox" class="accent-indigo-500">
      </div>

      <div class="rounded-2xl bg-indigo-500/8 p-4 dark:bg-indigo-500/[0.06] border border-indigo-500/10 dark:border-indigo-500/15 transition-all duration-300 hover:shadow-sm hover:shadow-indigo-500/[0.04]">
        <div class="text-sm text-indigo-700 font-medium dark:text-indigo-300">
          {{ tn('settings.retrieval_title') }}
        </div>
      </div>
      <FieldRange v-model="settings.retrievalTopK" :label="tn('settings.retrieval_top_k')" :min="1" :max="20" :step="1" />

      <div class="rounded-2xl bg-indigo-500/8 p-4 dark:bg-indigo-500/[0.06] border border-indigo-500/10 dark:border-indigo-500/15 transition-all duration-300 hover:shadow-sm hover:shadow-indigo-500/[0.04]">
        <div class="text-sm text-indigo-700 font-medium dark:text-indigo-300">
          {{ tn('settings.extract_title') }}
        </div>
      </div>
      <div class="flex items-center justify-between rounded-xl bg-white/60 p-3 dark:bg-neutral-800/60">
        <div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            {{ tn('settings.auto_extract') }}
          </div>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">
            {{ tn('settings.auto_extract_desc') }}
          </div>
        </div>
        <input v-model="settings.autoExtract" type="checkbox" class="accent-indigo-500">
      </div>

      <div class="rounded-2xl bg-indigo-500/8 p-4 dark:bg-indigo-500/[0.06] border border-indigo-500/10 dark:border-indigo-500/15 transition-all duration-300 hover:shadow-sm hover:shadow-indigo-500/[0.04]">
        <div class="text-sm text-indigo-700 font-medium dark:text-indigo-300">
          {{ tn('settings.storage_title') }}
        </div>
      </div>
      <FieldSelect v-model="settings.provider" :label="tn('settings.provider')" :options="providerOptions" />
      <FieldInput v-if="settings.provider === 'mem0'" v-model="settings.apiKey" type="password" :label="tn('settings.api_key')" />

      <Button variant="primary" :loading="savingSettings" @click="handleSaveSettings">
        {{ tn('settings.save') }}
      </Button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
