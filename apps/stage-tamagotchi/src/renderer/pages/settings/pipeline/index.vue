<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ref, watch } from 'vue'

import { useRunPipeline } from './use-run-pipeline'
import PipelineRail from './PipelineRail.vue'
import PipelineBoard from './PipelineBoard.vue'
import type { PipelineStageId } from './stages'

// ——— 安全与权限 ———
import EnvironmentPanel from './components/EnvironmentPanel.vue'
import WhitelistPanel from '../environment/components/WhitelistPanel.vue'

// ——— 连接与运维（组合第 2/3 项复用现有薄壳内容） ———
import ConnectorsPanel from '../environment/components/ConnectorsPanel.vue'
import AgentApiPanel from '../environment/components/AgentApiPanel.vue'
import DoctorPanel from '../environment/components/DoctorPanel.vue'
import McpAgentPane from './components/McpAgentPane.vue'
import ComfyuiSection from '../sidecar/comfyui-section.vue'
import TtsSection from '../sidecar/tts-section.vue'

const { t } = useI18n()
const route = useRoute()
const run = useRunPipeline()

/** 右侧工作区当前 Tab */
const activeTab = ref<'run' | 'security' | 'ops'>('run')
/** 安全/运维 Tab 下二级条目 */
const subTab = ref<'environment' | 'whitelist' | 'connectors' | 'mcp-agent' | 'sidecar' | 'health'>('environment')

const govRunning = ref(false)

const TABS = [
  { id: 'run', labelKey: 'settings.pages.pipeline.tabs.run' },
  { id: 'security', labelKey: 'settings.pages.pipeline.tabs.security' },
  { id: 'ops', labelKey: 'settings.pages.pipeline.tabs.ops' },
] as const

// 深链支持：?tab=security / ?tab=ops 直达对应 Tab
watch(() => route.query.tab, (tab) => {
  if (tab === 'security' || tab === 'ops')
    activeTab.value = tab
}, { immediate: true })

function scrollToStage(stage: PipelineStageId) {
  const el = document.getElementById(`pipeline-block-${stage}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setTab(tab: 'run' | 'security' | 'ops') {
  activeTab.value = tab
  if (tab === 'security')
    subTab.value = 'environment'
  else if (tab === 'ops')
    subTab.value = 'connectors'
}

type SubTabId = 'environment' | 'whitelist' | 'connectors' | 'mcp-agent' | 'sidecar' | 'health'

interface SubTabItem { id: SubTabId, labelKey: string }

const SECURITY_SUB_TABS: SubTabItem[] = [
  { id: 'environment', labelKey: 'settings.nav.environment' },
  { id: 'whitelist', labelKey: 'settings.nav.whitelist' },
]
const OPS_SUB_TABS: SubTabItem[] = [
  { id: 'connectors', labelKey: 'settings.nav.connectors' },
  { id: 'mcp-agent', labelKey: 'settings.nav.mcp-agent' },
  { id: 'sidecar', labelKey: 'settings.nav.sidecar' },
  { id: 'health', labelKey: 'settings.nav.health' },
]
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <!-- 左：流程条 -->
    <PipelineRail
      :snapshot="run.snapshot.value"
      :active-tab="activeTab"
      :gov-running="govRunning"
      @scroll-to="scrollToStage"
      @set-tab="setTab"
    />

    <!-- 右：工作区 -->
    <div class="flex min-w-0 flex-col gap-4">
      <!-- 顶部 Tab 切换 -->
      <div class="flex items-center gap-1 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-1">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          :class="activeTab === tab.id ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'"
          @click="setTab(tab.id)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>

      <!-- 二级 Tab：安全与权限 / 连接与运维 的条目切换条 -->
      <div
        v-if="activeTab !== 'run'"
        class="flex items-center gap-1 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] p-1"
      >
        <button
          v-for="item in (activeTab === 'security' ? SECURITY_SUB_TABS : OPS_SUB_TABS)"
          :key="item.id"
          class="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          :class="subTab === item.id ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'"
          @click="subTab = item.id"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>

      <!-- Tab1：运行流水线（v-show 保状态） -->
      <div v-show="activeTab === 'run'" class="flex flex-col gap-4">
        <PipelineBoard :run="run" />
      </div>

      <!-- Tab2：安全与权限 -->
      <div v-show="activeTab === 'security'" class="flex flex-col gap-4">
        <template v-if="subTab === 'environment'">
          <EnvironmentPanel />
        </template>
        <template v-else>
          <WhitelistPanel />
        </template>
      </div>

      <!-- Tab3：连接与运维 -->
      <div v-show="activeTab === 'ops'" class="flex flex-col gap-4">
        <template v-if="subTab === 'connectors'">
          <!-- 复用连接器页内容（连接器 + Agent API 双栏） -->
          <section class="settings-panel">
            <div flex="~ col gap-1">
              <h3 class="text-sm font-semibold">
                {{ t('settings.nav.connectors') }}
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ t('settings.groups.cards.connectors.description') }}
              </p>
            </div>
          </section>
          <div class="grid gap-4 lg:grid-cols-2">
            <ConnectorsPanel />
            <AgentApiPanel />
          </div>
        </template>
        <template v-else-if="subTab === 'mcp-agent'">
          <!-- MCP 接入：复用薄壳页结构，简单改名即可。此处直接内嵌原页逻辑最省： -->
          <McpAgentPane />
        </template>
        <template v-else-if="subTab === 'sidecar'">
          <!-- 本地服务（GPT-SoVITS / ComfyUI） -->
          <section class="settings-panel">
            <div flex="~ col gap-1">
              <h3 class="text-sm font-semibold">
                {{ t('settings.nav.sidecar') }}
              </h3>
              <p class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ t('settings.groups.cards.sidecar.description') }}
              </p>
            </div>
          </section>
          <div class="flex flex-col gap-6">
            <ComfyuiSection />
            <TtsSection />
          </div>
        </template>
        <template v-else>
          <DoctorPanel />
        </template>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.pipeline.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.pipeline.description
  icon: i-solar:diagram-up-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>