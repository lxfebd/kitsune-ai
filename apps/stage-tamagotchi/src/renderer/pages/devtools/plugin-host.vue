<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Plugin {
  id: string
  name: string
  version: string
  status: 'active' | 'inactive' | 'error'
  description?: string
  permissions?: string[]
  error?: string
}

const plugins = ref<Plugin[]>([])
const isLoading = ref(true)
const selectedPlugin = ref<Plugin | null>(null)

// Mock plugin data - in real implementation, use plugin-sdk
onMounted(async () => {
  isLoading.value = true
  
  // Simulate loading
  await new Promise(resolve => setTimeout(resolve, 500))
  
  plugins.value = [
    {
      id: 'core-agent',
      name: 'Core Agent',
      version: '1.0.0',
      status: 'active',
      description: 'Core AI agent runtime',
      permissions: ['agent.*', 'context.*'],
    },
    {
      id: 'live2d-driver',
      name: 'Live2D Driver',
      version: '0.9.0',
      status: 'active',
      description: 'Live2D model rendering and animation',
      permissions: ['renderer.live2d'],
    },
    {
      id: 'tts-hybrid',
      name: 'TTS Hybrid',
      version: '0.8.0',
      status: 'inactive',
      description: 'Hybrid text-to-speech engine',
      permissions: ['speech.synthesize'],
    },
    {
      id: 'mcp-bridge',
      name: 'MCP Bridge',
      version: '0.7.0',
      status: 'error',
      description: 'Model Context Protocol bridge',
      error: 'Connection failed: ECONNREFUSED',
    },
  ]
  
  isLoading.value = false
})

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-green-500/10 text-green-500'
    case 'inactive': return 'bg-neutral-500/10 text-neutral-500'
    case 'error': return 'bg-red-500/10 text-red-500'
    default: return 'bg-neutral-500/10 text-neutral-500'
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'active': return 'i-solar:check-circle-bold'
    case 'inactive': return 'i-solar:pause-circle-bold'
    case 'error': return 'i-solar:danger-circle-bold'
    default: return 'i-solar:question-circle-bold'
  }
}

async function togglePlugin(plugin: Plugin) {
  if (plugin.status === 'active') {
    plugin.status = 'inactive'
  } else if (plugin.status === 'inactive') {
    plugin.status = 'active'
  }
}

async function reloadPlugin(plugin: Plugin) {
  // Mock reload
  plugin.status = 'active'
  plugin.error = undefined
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06]">
      <div>
        <h2 class="text-lg font-medium m-0">
          {{ t('tamagotchi.settings.devtools.pages.plugin-host.title', 'Plugin Host') }}
        </h2>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 m-0">
          {{ t('tamagotchi.settings.devtools.pages.plugin-host.description', 'Manage and inspect loaded plugins') }}
        </p>
      </div>
      
      <div class="text-sm text-neutral-500">
        {{ plugins.length }} plugins loaded
      </div>
    </div>
    
    <!-- Content -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="i-solar:refresh-bold animate-spin w-6 h-6 text-neutral-400" />
      </div>
      
      <!-- Empty State -->
      <div v-else-if="plugins.length === 0" class="flex flex-col items-center justify-center h-full gap-2 text-neutral-400">
        <div class="i-solar:plugin-bold w-12 h-12" />
        <p>No plugins loaded</p>
      </div>
      
      <!-- Plugin List -->
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="plugin in plugins"
          :key="plugin.id"
          :class="[
            'p-4 rounded-lg border border-black/[0.06] dark:border-white/[0.06]',
            'bg-white dark:bg-neutral-900',
            'cursor-pointer transition-all duration-200',
            'hover:border-primary-500/30',
            selectedPlugin?.id === plugin.id ? 'border-primary-500' : '',
          ]"
          @click="selectedPlugin = selectedPlugin?.id === plugin.id ? null : plugin"
        >
          <!-- Plugin Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="i-solar:plugin-bold w-5 h-5 text-primary-500" />
              
              <div>
                <h3 class="text-sm font-medium m-0">
                  {{ plugin.name }}
                </h3>
                <p class="text-xs text-neutral-500 m-0">
                  v{{ plugin.version }}
                </p>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <span
                :class="[
                  'px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1',
                  getStatusColor(plugin.status),
                ]"
              >
                <div :class="[getStatusIcon(plugin.status), 'w-3 h-3']" />
                {{ plugin.status }}
              </span>
            </div>
          </div>
          
          <!-- Plugin Description -->
          <p v-if="plugin.description" class="text-sm text-neutral-600 dark:text-neutral-400 mt-2 m-0">
            {{ plugin.description }}
          </p>
          
          <!-- Error Message -->
          <div
            v-if="plugin.error"
            class="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20"
          >
            <p class="text-xs text-red-500 m-0">
              {{ plugin.error }}
            </p>
          </div>
          
          <!-- Expanded Details -->
          <div v-if="selectedPlugin?.id === plugin.id" class="mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
            <!-- Permissions -->
            <div v-if="plugin.permissions && plugin.permissions.length > 0" class="mb-3">
              <h4 class="text-xs font-medium text-neutral-500 mb-1">Permissions</h4>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="perm in plugin.permissions"
                  :key="perm"
                  class="px-2 py-0.5 text-xs bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 rounded"
                >
                  {{ perm }}
                </span>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button
                :class="[
                  'px-3 py-1.5 rounded-lg text-xs font-medium',
                  plugin.status === 'active'
                    ? 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20'
                    : 'bg-green-500/10 text-green-600 hover:bg-green-500/20',
                  'transition-all duration-200',
                ]"
                @click.stop="togglePlugin(plugin)"
              >
                {{ plugin.status === 'active' ? 'Disable' : 'Enable' }}
              </button>
              
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-500/10 text-neutral-600 hover:bg-neutral-500/20 transition-all duration-200"
                @click.stop="reloadPlugin(plugin)"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.plugin-host.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
