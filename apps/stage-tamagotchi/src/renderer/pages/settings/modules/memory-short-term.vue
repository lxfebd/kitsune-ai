<script setup lang="ts">
import type { MemoryEntry, MemorySettings, MemoryStats } from '../../../../shared/eventa'

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
  electronShortTermMemoryAddEntry,
  electronShortTermMemoryCleanup,
  electronShortTermMemoryClearAll,
  electronShortTermMemoryExport,
  electronShortTermMemoryGetSettings,
  electronShortTermMemoryGetStats,
  electronShortTermMemoryImport,
  electronShortTermMemoryListEntries,
  electronShortTermMemoryRemoveEntry,
  electronShortTermMemorySetSettings,
} from '../../../../shared/eventa'

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.memory-short-term.${key}`, params ?? {})

const invokeGetStats = useElectronEventaInvoke(electronShortTermMemoryGetStats)
const invokeListEntries = useElectronEventaInvoke(electronShortTermMemoryListEntries)
const invokeAddEntry = useElectronEventaInvoke(electronShortTermMemoryAddEntry)
const invokeRemoveEntry = useElectronEventaInvoke(electronShortTermMemoryRemoveEntry)
const invokeClearAll = useElectronEventaInvoke(electronShortTermMemoryClearAll)
const invokeCleanup = useElectronEventaInvoke(electronShortTermMemoryCleanup)
const invokeExport = useElectronEventaInvoke(electronShortTermMemoryExport)
const invokeImport = useElectronEventaInvoke(electronShortTermMemoryImport)
const invokeGetSettings = useElectronEventaInvoke(electronShortTermMemoryGetSettings)
const invokeSetSettings = useElectronEventaInvoke(electronShortTermMemorySetSettings)

const activeTab = ref<'overview' | 'entries' | 'settings'>('overview')

// Overview
const stats = ref<MemoryStats>({ totalEntries: 0, totalSizeBytes: 0, lastCleanedAt: null, nextCleanupAt: null })
const cleanupResult = ref<{ removed: number } | null>(null)
const clearing = ref(false)
const exporting = ref(false)
const importing = ref(false)

// Entries
const entries = ref<MemoryEntry[]>([])
const loadingEntries = ref(false)
const searchQuery = ref('')
const filterType = ref('all')
const selectedEntry = ref<MemoryEntry | null>(null)
const deletingId = ref<string | null>(null)
const showAddForm = ref(false)
const newEntryContent = ref('')
const newEntryType = ref('context')
const addingEntry = ref(false)

// Settings
const settings = ref<MemorySettings>({
  retentionDays: 7,
  maxEntries: 1000,
  autoCleanup: true,
  autoExtract: false,
  expirationDays: 7,
  retrievalTopK: 10,
  provider: 'local',
  apiKey: '',
})
const savingSettings = ref(false)

const tabs = computed(() => [
  { id: 'overview' as const, label: tn('tabs.overview') },
  { id: 'entries' as const, label: tn('tabs.entries') },
  { id: 'settings' as const, label: tn('tabs.settings') },
])

const filterTypeOptions = computed(() => [
  { label: tn('entries.filters.all'), value: 'all' },
  { label: tn('entries.filters.fact'), value: 'fact' },
  { label: tn('entries.filters.preference'), value: 'preference' },
  { label: tn('entries.filters.event'), value: 'event' },
  { label: tn('entries.filters.context'), value: 'context' },
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
    a.download = `short-term-memory-export-${new Date().toISOString().slice(0, 10)}.json`
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

async function handleAddEntry() {
  if (!newEntryContent.value.trim())
    return
  addingEntry.value = true
  try {
    await invokeAddEntry({
      content: newEntryContent.value.trim(),
      type: newEntryType.value,
    })
    newEntryContent.value = ''
    newEntryType.value = 'context'
    showAddForm.value = false
    await loadEntries()
    await loadStats()
  }
  finally {
    addingEntry.value = false
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
})

watch([searchQuery, filterType], () => {
  loadEntries()
})

onMounted(() => {
  loadStats()
  loadSettings()
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

    <!-- Entries -->
    <div v-else-if="activeTab === 'entries'" class="flex flex-col gap-3">
      <div class="flex gap-2">
        <FieldInput v-model="searchQuery" :placeholder="tn('entries.search_placeholder')" class="flex-1" />
        <FieldSelect v-model="filterType" :label="tn('entries.filter_type')" :options="filterTypeOptions" />
        <Button variant="secondary" size="sm" @click="showAddForm = true">
          {{ tn('entries.add') }}
        </Button>
      </div>

      <div v-if="showAddForm" class="flex flex-col gap-2 border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3 transition-all duration-300 hover:shadow-sm hover:shadow-black/[0.02] dark:hover:shadow-black/[0.08]">
        <div class="text-sm text-neutral-700 font-medium dark:text-neutral-300">
          {{ tn('entries.add_title') }}
        </div>
        <FieldTextArea v-model="newEntryContent" :placeholder="tn('entries.content')" />
        <FieldInput v-model="newEntryType" :placeholder="tn('entries.type')" />
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="sm" @click="showAddForm = false">
            {{ tn('entries.cancel') }}
          </Button>
          <Button variant="primary" size="sm" :loading="addingEntry" @click="handleAddEntry">
            {{ tn('entries.save') }}
          </Button>
        </div>
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

    <!-- Settings -->
    <div v-else-if="activeTab === 'settings'" class="flex flex-col gap-4">
      <div class="rounded-2xl bg-indigo-500/8 p-4 dark:bg-indigo-500/[0.06] border border-indigo-500/10 dark:border-indigo-500/15 transition-all duration-300 hover:shadow-sm hover:shadow-indigo-500/[0.04]">
        <div class="text-sm text-indigo-700 font-medium dark:text-indigo-300">
          {{ tn('settings.basic_title') }}
        </div>
      </div>
      <FieldRange v-model="settings.retentionDays" :label="tn('settings.retention_days')" :min="1" :max="30" :step="1" />
      <FieldRange v-model="settings.maxEntries" :label="tn('settings.max_entries')" :min="100" :max="10000" :step="100" />
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

      <Button variant="primary" :loading="savingSettings" @click="handleSaveSettings">
        {{ tn('settings.save') }}
      </Button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
