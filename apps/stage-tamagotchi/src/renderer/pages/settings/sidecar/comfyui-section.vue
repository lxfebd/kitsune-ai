<script setup lang="ts">
import type { ComfyUIStatus } from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { Button, Callout, FieldInput } from '@kitsune/ui'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'

import {
  electronComfyuiSetConfig,
  electronComfyuiStart,
  electronComfyuiStatus,
  electronComfyuiStatusChanged,
  electronComfyuiStop,
  electronDialogChooseDirectory,
} from '../../../../shared/eventa'

const invokeStart = useElectronEventaInvoke(electronComfyuiStart)
const invokeStop = useElectronEventaInvoke(electronComfyuiStop)
const invokeStatus = useElectronEventaInvoke(electronComfyuiStatus)
const invokeSetConfig = useElectronEventaInvoke(electronComfyuiSetConfig)
const invokeChooseDirectory = useElectronEventaInvoke(electronDialogChooseDirectory)

const PANEL = 'settings-panel'
const CARD = 'settings-card'

const status = ref<ComfyUIStatus | null>(null)
const dirInput = ref('')
const portInput = ref<number | undefined>(undefined)
const starting = ref(false)
const stopping = ref(false)
const testing = ref(false)
const saving = ref(false)
const savingPort = ref(false)
const picking = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')
const needsRestartNotice = ref(false)
// 标记 portInput 是否已从 status.url 同步过初始值，避免后续 status 刷新覆盖用户输入
let portInitialized = false

const STATE_BADGE: Record<ComfyUIStatus['state'], string> = {
  running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  starting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  stopping: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  stopped: 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  degraded: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

const STATE_LABEL: Record<ComfyUIStatus['state'], string> = {
  running: '运行中',
  starting: '启动中',
  stopping: '停止中',
  stopped: '已停止',
  error: '错误',
  degraded: '降级',
}

const currentState = computed(() => status.value?.state ?? 'stopped')
const isRunning = computed(() => currentState.value === 'running')
const isBusy = computed(() => starting.value || stopping.value)

// 从 status.url 解析当前配置端口（URL 格式: http://127.0.0.1:<port>）
const currentPort = computed(() => {
  const match = status.value?.url?.match(/:(\d+)$/)
  return match ? Number.parseInt(match[1], 10) : undefined
})

// 首次拿到 currentPort 时同步到 portInput，后续不再覆盖用户输入
watch(currentPort, (port) => {
  if (!portInitialized && port !== undefined) {
    portInput.value = port
    portInitialized = true
  }
}, { immediate: true })

const isPortValid = computed(() => {
  const p = portInput.value
  return p !== undefined && Number.isInteger(p) && p >= 1024 && p <= 65535
})

function setError(e: unknown) {
  errorMessage.value = errorMessageFrom(e) ?? '未知错误'
}

function clearMessages() {
  errorMessage.value = ''
  infoMessage.value = ''
  needsRestartNotice.value = false
}

async function refreshStatus() {
  try {
    status.value = await invokeStatus()
  }
  catch (e) {
    setError(e)
  }
}

async function startComfyui() {
  clearMessages()
  starting.value = true
  try {
    status.value = await invokeStart()
    infoMessage.value = 'ComfyUI 启动指令已发送'
  }
  catch (e) {
    setError(e)
  }
  finally {
    starting.value = false
  }
}

async function stopComfyui() {
  clearMessages()
  stopping.value = true
  try {
    status.value = await invokeStop()
    infoMessage.value = 'ComfyUI 已停止'
  }
  catch (e) {
    setError(e)
  }
  finally {
    stopping.value = false
  }
}

async function testConnection() {
  clearMessages()
  testing.value = true
  try {
    status.value = await invokeStatus()
    if (status.value?.running)
      infoMessage.value = `连接成功 — ${status.value.url}`
    else
      errorMessage.value = `无法连接到 ComfyUI（状态: ${STATE_LABEL[currentState.value]}）`
  }
  catch (e) {
    setError(e)
  }
  finally {
    testing.value = false
  }
}

async function chooseDirectory() {
  clearMessages()
  picking.value = true
  try {
    const result = await invokeChooseDirectory({ title: '选择 ComfyUI 安装目录' })
    if (!result.canceled && result.path)
      dirInput.value = result.path
  }
  catch (e) {
    setError(e)
  }
  finally {
    picking.value = false
  }
}

async function saveConfig() {
  if (!dirInput.value.trim()) {
    errorMessage.value = '请先选择或输入 ComfyUI 安装目录'
    return
  }
  clearMessages()
  saving.value = true
  try {
    const result = await invokeSetConfig({ dir: dirInput.value.trim() })
    if (result.needsRestart) {
      needsRestartNotice.value = true
      infoMessage.value = '路径已保存。ComfyUI 正在运行，需重启才能生效。'
    }
    else {
      infoMessage.value = '路径已保存。'
    }
  }
  catch (e) {
    setError(e)
  }
  finally {
    saving.value = false
  }
}

async function savePort() {
  if (!isPortValid.value) {
    errorMessage.value = '端口范围 1024-65535'
    return
  }
  clearMessages()
  savingPort.value = true
  try {
    const result = await invokeSetConfig({ port: portInput.value })
    if (result.needsRestart) {
      needsRestartNotice.value = true
      infoMessage.value = '端口已保存。ComfyUI 正在运行，需重启才能生效。'
    }
    else {
      infoMessage.value = '端口已保存。'
    }
  }
  catch (e) {
    setError(e)
  }
  finally {
    savingPort.value = false
  }
}

// 订阅状态变化事件（SidecarService 在进程状态变更时广播）
let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[comfyui-section] IPC bridge unavailable:', e)
}
const offStatusChanged = eventaContext?.on(electronComfyuiStatusChanged, (event) => {
  if (event?.body)
    status.value = event.body
})
onScopeDispose(() => offStatusChanged?.())

onMounted(() => {
  void refreshStatus()
})
</script>

<template>
  <section :class="PANEL">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-semibold">
          ComfyUI
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          本地图像生成服务，进程由 SidecarService 管理，API 通信走 HTTP（默认端口 8188，可配置）
        </p>
      </div>
      <span
        :class="[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
          STATE_BADGE[currentState],
        ]"
      >
        <span class="size-1 rounded-full bg-current opacity-80" />
        {{ STATE_LABEL[currentState] }}
      </span>
    </div>

    <Callout v-if="errorMessage" theme="orange" label="错误">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" label="提示">
      {{ infoMessage }}
    </Callout>
    <Callout v-if="needsRestartNotice && !infoMessage" theme="orange">
      路径已变更，需重启 ComfyUI 才能生效。
    </Callout>

    <!-- 路径配置 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          安装目录
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          指向 ComfyUI 便携版根目录（含 python_embeded 与 ComfyUI/main.py）
        </span>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <FieldInput
            v-model="dirInput"
            type="text"
            placeholder="点击「选择目录」或手动输入路径..."
          />
        </div>
        <Button
          variant="secondary" size="md"
          :loading="picking"
          :disabled="picking"
          label="选择目录"
          icon="i-solar:folder-bold-duotone"
          @click="chooseDirectory"
        />
        <Button
          variant="primary" size="md"
          :loading="saving"
          :disabled="saving || !dirInput.trim()"
          label="保存路径"
          icon="i-solar:diskette-bold-duotone"
          @click="saveConfig"
        />
      </div>
    </div>

    <!-- 端口配置 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          服务端口
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          ComfyUI HTTP 监听端口（范围 1024-65535，默认 8188）；修改后需重启 ComfyUI 生效
        </span>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <FieldInput
            v-model="portInput"
            type="number"
            placeholder="8188"
          />
        </div>
        <Button
          variant="primary" size="md"
          :loading="savingPort"
          :disabled="savingPort || !isPortValid"
          label="保存端口"
          icon="i-solar:diskette-bold-duotone"
          @click="savePort"
        />
      </div>
    </div>

    <!-- 运行状态详情 -->
    <div :class="CARD">
      <div class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        运行状态
      </div>
      <div v-if="isRunning && status" class="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-300">
        <div class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">URL:</span>
          <code class="break-all rounded bg-neutral-200/60 px-1 py-0.5 font-mono dark:bg-neutral-800">{{ status.url }}</code>
        </div>
        <div v-if="status.version" class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">版本:</span>
          <span class="font-mono">{{ status.version }}</span>
        </div>
        <div v-if="status.gpu" class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">GPU:</span>
          <span>{{ status.gpu }}</span>
        </div>
        <div v-if="status.vram" class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">显存:</span>
          <span>{{ status.vram }}</span>
        </div>
      </div>
      <div v-else class="text-xs text-neutral-500 dark:text-neutral-400">
        ComfyUI 未运行，点击「启动」开始服务。
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center justify-end gap-2">
      <Button
        variant="secondary" size="sm"
        :loading="testing"
        :disabled="testing"
        label="测试连接"
        icon="i-solar:link-bold-duotone"
        @click="testConnection"
      />
      <Button
        v-if="!isRunning"
        variant="primary" size="sm"
        :loading="starting"
        :disabled="isBusy"
        label="启动"
        icon="i-solar:play-bold-duotone"
        @click="startComfyui"
      />
      <Button
        v-else
        variant="danger" size="sm"
        :loading="stopping"
        :disabled="isBusy"
        label="停止"
        icon="i-solar:stop-bold-duotone"
        @click="stopComfyui"
      />
    </div>
  </section>
</template>
