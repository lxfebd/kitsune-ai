<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Mock context flow data
const contextEntries = ref<Array<{
  id: string
  timestamp: Date
  type: 'system' | 'user' | 'assistant' | 'tool' | 'context'
  content: string
  source?: string
}>>([])

const isCapturing = ref(false)
let captureInterval: ReturnType<typeof setInterval> | null = null

function startCapture() {
  isCapturing.value = true
  
  // Mock capture - in real implementation, hook into context registry
  captureInterval = setInterval(() => {
    const types = ['system', 'user', 'assistant', 'tool', 'context'] as const
    const type = types[Math.floor(Math.random() * types.length)]
    
    contextEntries.value.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      content: `Sample ${type} message at ${new Date().toLocaleTimeString()}`,
      source: type === 'context' ? 'context-registry' : undefined,
    })
    
    // Keep only last 100 entries
    if (contextEntries.value.length > 100) {
      contextEntries.value = contextEntries.value.slice(0, 100)
    }
  }, 1000)
}

function stopCapture() {
  isCapturing.value = false
  if (captureInterval) {
    clearInterval(captureInterval)
    captureInterval = null
  }
}

function clearEntries() {
  contextEntries.value = []
}

onMounted(() => {
  // Auto-start capture
  startCapture()
})

onUnmounted(() => {
  stopCapture()
})

function getTypeColor(type: string) {
  switch (type) {
    case 'system': return 'text-blue-500 bg-blue-500/10'
    case 'user': return 'text-green-500 bg-green-500/10'
    case 'assistant': return 'text-purple-500 bg-purple-500/10'
    case 'tool': return 'text-orange-500 bg-orange-500/10'
    case 'context': return 'text-cyan-500 bg-cyan-500/10'
    default: return 'text-neutral-500 bg-neutral-500/10'
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
      <div>
        <h2 class="text-lg font-medium m-0">
          {{ t('tamagotchi.settings.devtools.pages.context-flow.title', 'Context Flow') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 m-0">
          {{ t('tamagotchi.settings.devtools.pages.context-flow.description', 'Monitor context registry entries in real-time') }}
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <button
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium',
            'transition-all duration-200',
            isCapturing
              ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
              : 'bg-green-500/10 text-green-600 hover:bg-green-500/20',
          ]"
          @click="isCapturing ? stopCapture() : startCapture()"
        >
          {{ isCapturing ? 'Stop' : 'Start' }}
        </button>
        
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-500/10 text-neutral-600 hover:bg-neutral-500/20 transition-all duration-200"
          @click="clearEntries"
        >
          Clear
        </button>
      </div>
    </div>
    
    <!-- Entries List -->
    <div class="flex-1 overflow-auto p-4">
      <div v-if="contextEntries.length === 0" class="flex items-center justify-center h-full text-neutral-400">
        No context entries captured yet
      </div>
      
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="entry in contextEntries"
          :key="entry.id"
          :class="[
            'p-3 rounded-lg border border-black/[0.06] dark:border-white/[0.06]',
            'bg-white dark:bg-neutral-900',
          ]"
        >
          <div class="flex items-center gap-2 mb-1">
            <span
              :class="[
                'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                getTypeColor(entry.type),
              ]"
            >
              {{ entry.type }}
            </span>
            
            <span class="text-xs text-neutral-400">
              {{ entry.timestamp.toLocaleTimeString() }}
            </span>
            
            <span v-if="entry.source" class="text-xs text-neutral-400">
              · {{ entry.source }}
            </span>
          </div>
          
          <p class="text-sm text-neutral-700 dark:text-neutral-300 m-0">
            {{ entry.content }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.context-flow.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
