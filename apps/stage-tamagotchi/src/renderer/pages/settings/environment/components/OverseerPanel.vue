<script setup lang="ts">
import type { OverseerStatus } from '../../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout } from '@kitsune/ui'
import { onScopeDispose, ref } from 'vue'

import {
  electronOverseerEvent,
  electronOverseerStatus,
  electronOverseerToggle,
} from '../../../../../shared/eventa'
import { useEnvironmentI18n } from './use-environment-i18n'

const { tn } = useEnvironmentI18n()
const invokeOverseerToggle = useElectronEventaInvoke(electronOverseerToggle)
const invokeOverseerStatus = useElectronEventaInvoke(electronOverseerStatus)

const PANEL = 'settings-panel'

const status = ref<OverseerStatus>({ enabled: false, running: false, tools: [], updatedAt: 0 })
const busy = ref(false)
const errorMessage = ref('')

async function toggle() {
  busy.value = true
  errorMessage.value = ''
  try {
    const next = !status.value.enabled
    const result = await invokeOverseerToggle({ enabled: next })
    if (result)
      status.value.enabled = result.enabled
    await refreshStatus()
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    busy.value = false
  }
}

async function refreshStatus() {
  try {
    const s = await invokeOverseerStatus()
    if (s)
      status.value = s
  }
  catch {
    // 状态查询失败不影响页面
  }
}

let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch {
  // IPC bridge 不可用
}

const offEvent = eventaContext?.on(electronOverseerEvent, () => {
  // 事件到达时刷新状态（延迟 100ms 等主进程状态更新完成）
  setTimeout(refreshStatus, 100)
})
onScopeDispose(() => offEvent?.())

refreshStatus()
</script>

<template>
  <section :class="PANEL">
    <Callout v-if="errorMessage" theme="orange" :label="tn('overseer.error-title')">
      {{ errorMessage }}
    </Callout>
    <div class="flex items-start justify-between gap-2">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('overseer.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('overseer.description') }}
        </p>
      </div>
      <span
        :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          status.running ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ status.running ? tn('overseer.status.running') : tn('overseer.status.stopped') }}
      </span>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-xs text-neutral-600 dark:text-neutral-300">
        {{ tn('overseer.enable-label') }}
      </span>
      <Button
        :variant="status.enabled ? 'danger' : 'primary'"
        size="sm"
        :loading="busy"
        :label="status.enabled ? tn('overseer.disable') : tn('overseer.enable')"
        :icon="status.enabled ? 'i-solar:close-circle-bold-duotone' : 'i-solar:play-bold-duotone'"
        @click="toggle"
      />
    </div>

    <!-- 监听工具列表 -->
    <div v-if="status.tools.length" class="flex flex-col gap-1.5">
      <div class="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ tn('overseer.tools-title') }}
      </div>
      <article
        v-for="tool in status.tools"
        :key="tool.id"
        :class="['flex items-center justify-between rounded-xl border px-3 py-2 text-xs', 'border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]']"
      >
        <span class="font-medium">{{ tool.name }}</span>
        <span :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          tool.running ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-400/20 text-neutral-500',
        ]">
          {{ tool.running ? tn('overseer.tool-running') : tn('overseer.tool-idle') }}
        </span>
      </article>
    </div>
  </section>
</template>