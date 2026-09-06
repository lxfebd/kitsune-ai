<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface WebSocketMessage {
  id: string
  timestamp: Date
  direction: 'sent' | 'received'
  event: string
  data: unknown
  size: number
}

const messages = ref<WebSocketMessage[]>([])
const isConnected = ref(false)
const filterDirection = ref<'all' | 'sent' | 'received'>('all')
const filterEvent = ref('')

const filteredMessages = computed(() => {
  let result = messages.value
  
  if (filterDirection.value !== 'all') {
    result = result.filter(m => m.direction === filterDirection.value)
  }
  
  if (filterEvent.value) {
    const search = filterEvent.value.toLowerCase()
    result = result.filter(m => m.event.toLowerCase().includes(search))
  }
  
  return result
})

const stats = computed(() => {
  const sent = messages.value.filter(m => m.direction === 'sent').length
  const received = messages.value.filter(m => m.direction === 'received').length
  const totalSize = messages.value.reduce((sum, m) => sum + m.size, 0)
  
  return { sent, received, total: messages.value.length, totalSize }
})

// Mock WebSocket connection
let mockInterval: ReturnType<typeof setInterval> | null = null

function connect() {
  isConnected.value = true
  
  // Mock messages - in real implementation, hook into server-sdk
  mockInterval = setInterval(() => {
    const events = ['chat.message', 'chat.typing', 'system.heartbeat', 'context.update', 'tool.call']
    const event = events[Math.floor(Math.random() * events.length)]
    const direction = Math.random() > 0.5 ? 'sent' : 'received'
    
    const data = { timestamp: Date.now(), payload: `Sample ${event} data` }
    const dataStr = JSON.stringify(data)
    
    messages.value.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      direction,
      event,
      data,
      size: dataStr.length,
    })
    
    // Keep only last 200 messages
    if (messages.value.length > 200) {
      messages.value = messages.value.slice(0, 200)
    }
  }, 500)
}

function disconnect() {
  isConnected.value = false
  if (mockInterval) {
    clearInterval(mockInterval)
    mockInterval = null
  }
}

function clearMessages() {
  messages.value = []
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
      <div>
        <h2 class="text-lg font-medium m-0">
          {{ t('tamagotchi.settings.devtools.pages.websocket-inspector.title', 'WebSocket Inspector') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 m-0">
          {{ t('tamagotchi.settings.devtools.pages.websocket-inspector.description', 'Monitor WebSocket messages in real-time') }}
        </p>
      </div>
      
      <div class="flex items-center gap-2">
        <div
          :class="[
            'w-2 h-2 rounded-full',
            isConnected ? 'bg-green-500' : 'bg-red-500',
          ]"
        />
        <span class="text-sm text-neutral-500">
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </div>
    
    <!-- Stats -->
    <div class="flex items-center gap-4 p-4 bg-black/[0.03] dark:bg-white/[0.03]">
      <div class="text-sm">
        <span class="text-neutral-500">Total:</span>
        <span class="font-medium ml-1">{{ stats.total }}</span>
      </div>
      <div class="text-sm">
        <span class="text-neutral-500">Sent:</span>
        <span class="font-medium ml-1 text-blue-500">{{ stats.sent }}</span>
      </div>
      <div class="text-sm">
        <span class="text-neutral-500">Received:</span>
        <span class="font-medium ml-1 text-green-500">{{ stats.received }}</span>
      </div>
      <div class="text-sm">
        <span class="text-neutral-500">Size:</span>
        <span class="font-medium ml-1">{{ formatSize(stats.totalSize) }}</span>
      </div>
      
      <div class="flex-1" />
      
      <button
        class="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-500/10 text-neutral-600 hover:bg-neutral-500/20 transition-all duration-200"
        @click="clearMessages"
      >
        Clear
      </button>
    </div>
    
    <!-- Filters -->
    <div class="flex items-center gap-2 p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
      <select
        v-model="filterDirection"
        :class="[
          'px-2 py-1 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'outline-none',
        ]"
      >
        <option value="all">All Directions</option>
        <option value="sent">Sent</option>
        <option value="received">Received</option>
      </select>
      
      <input
        v-model="filterEvent"
        placeholder="Filter by event..."
        :class="[
          'px-3 py-1 rounded-lg text-sm flex-1',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'outline-none',
        ]"
      >
    </div>
    
    <!-- Messages List -->
    <div class="flex-1 overflow-auto p-4">
      <div v-if="filteredMessages.length === 0" class="flex items-center justify-center h-full text-neutral-400">
        No messages captured yet
      </div>
      
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="msg in filteredMessages"
          :key="msg.id"
          :class="[
            'p-3 rounded-lg border border-black/[0.06] dark:border-white/[0.06]',
            'bg-white dark:bg-neutral-900',
          ]"
        >
          <div class="flex items-center gap-2 mb-1">
            <span
              :class="[
                'px-2 py-0.5 text-xs font-medium rounded-full',
                msg.direction === 'sent'
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'bg-green-500/10 text-green-500',
              ]"
            >
              {{ msg.direction }}
            </span>
            
            <span class="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              {{ msg.event }}
            </span>
            
            <span class="text-xs text-neutral-400">
              {{ msg.timestamp.toLocaleTimeString() }}
            </span>
            
            <span class="text-xs text-neutral-400">
              {{ formatSize(msg.size) }}
            </span>
          </div>
          
          <pre class="text-xs text-neutral-600 dark:text-neutral-400 m-0 overflow-auto max-h-32">{{ JSON.stringify(msg.data, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.websocket-inspector.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
