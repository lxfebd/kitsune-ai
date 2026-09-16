<script setup lang="ts">
import type { ElectronMcpAgentTemplate } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Callout } from '@kitsune/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronMcpGetAgentTemplates } from '../../../../../shared/eventa'

const { t } = useI18n()

const invokeGetTemplates = useElectronEventaInvoke(electronMcpGetAgentTemplates)

const templates = ref<ElectronMcpAgentTemplate[]>([])
const errorMessage = ref('')
const copiedAgentId = ref<string | null>(null)

async function loadTemplates() {
  try {
    templates.value = (await invokeGetTemplates()) ?? []
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

async function copyConfig(tpl: ElectronMcpAgentTemplate) {
  try {
    await navigator.clipboard.writeText(tpl.config)
    copiedAgentId.value = tpl.agentId
    setTimeout(() => {
      if (copiedAgentId.value === tpl.agentId)
        copiedAgentId.value = null
    }, 2000)
  }
  catch {
    // clipboard 可能被系统拒绝（无焦点/权限），提示手动复制
    errorMessage.value = t('settings.pages.environment.mcp-agent.copy-failed')
  }
}

onMounted(loadTemplates)
</script>

<template>
  <div flex="~ col gap-4">
    <!-- 头部：标题 + 描述 -->
    <section class="settings-panel">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ t('settings.groups.cards.mcp-agent.description') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.pages.environment.mcp-agent.description') }}
        </p>
      </div>
    </section>

    <section class="settings-panel">
      <p class="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
        {{ t('settings.pages.environment.mcp-agent.intro') }}
      </p>
      <p class="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
        {{ t('settings.pages.environment.mcp-agent.http-url-label') }}: <code class="rounded bg-neutral-200/70 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">{{ templates[0]?.httpUrl ?? 'http://127.0.0.1:6123/mcp' }}</code>
        <span class="text-neutral-500 dark:text-neutral-400">({{ t('settings.pages.environment.mcp-agent.http-url-hint') }})</span>
      </p>
    </section>

    <Callout v-if="errorMessage" theme="orange" :label="t('settings.pages.environment.mcp-agent.title')">
      {{ errorMessage }}
    </Callout>

    <div v-if="!templates.length && !errorMessage" class="border-2 border-neutral-200 rounded-lg border-dashed p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
      {{ t('settings.pages.environment.mcp-agent.intro') }}
    </div>

    <article
      v-for="tpl in templates"
      :key="tpl.agentId"
      class="settings-card"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ tpl.label }}</span>
            <span
              :class="[
                'rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                tpl.mode === 'url'
                  ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300'
                  : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
              ]"
            >
              {{ t(`settings.pages.environment.mcp-agent.mode.${tpl.mode}`) }}
            </span>
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t(`settings.pages.environment.mcp-agent.mode-hint.${tpl.mode}`) }}
          </div>
          <div v-if="tpl.httpUrl" class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ tpl.httpUrl }}
          </div>
        </div>
        <button
          class="shrink-0 rounded-lg bg-primary-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-600"
          :aria-label="t('settings.pages.environment.mcp-agent.copy')"
          @click="copyConfig(tpl)"
        >
          {{ copiedAgentId === tpl.agentId ? t('settings.pages.environment.mcp-agent.copied') : t('settings.pages.environment.mcp-agent.copy') }}
        </button>
      </div>

      <div class="mt-2 border-t border-neutral-200/70 pt-2 dark:border-neutral-800">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{{ t('settings.pages.environment.mcp-agent.config-file-label') }}: <code class="rounded bg-neutral-200/70 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">{{ tpl.configFile }}</code></span>
          <span v-if="tpl.mode === 'stdio'" class="text-neutral-500 dark:text-neutral-400">{{ t('settings.pages.environment.mcp-agent.packaged-entry-hint', { entry: tpl.configPaths[0] ?? '' }) }}</span>
        </div>
        <details v-if="tpl.configPaths.length" class="mt-1">
          <summary class="cursor-pointer text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.environment.mcp-agent.config-paths-label') }}
          </summary>
          <ul class="mt-1 flex flex-col gap-0.5">
            <li
              v-for="path in tpl.configPaths"
              :key="path"
              class="font-mono text-[11px] text-neutral-600 dark:text-neutral-300"
            >
              {{ path }}
            </li>
          </ul>
        </details>
      </div>

      <pre class="mt-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-[11px] leading-relaxed text-neutral-100 dark:bg-black/40">{{ tpl.config }}</pre>
    </article>
  </div>
</template>