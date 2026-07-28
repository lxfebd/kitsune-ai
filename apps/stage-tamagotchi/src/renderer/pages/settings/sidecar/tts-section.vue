<script setup lang="ts">
import type { SidecarState, SidecarStatus, TtsEngine, TtsEngineInfo } from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { getDefaultEngineId, getEngine, listEngines } from '@kitsune/tts-hybrid'
import { Button, Callout, FieldInput, FieldSelect } from '@kitsune/ui'
import { computed, onMounted, onScopeDispose, ref } from 'vue'

import {
  electronDialogChooseDirectory,
  electronDialogChooseFile,
  electronSidecarStatus,
  electronSidecarStatusChanged,
  electronTtsCloneVoice,
  electronTtsCurrentEngine,
  electronTtsGetConfig,
  electronTtsGetEngines,
  electronTtsInstallProgress,
  electronTtsListVoices,
  electronTtsRemoveVoice,
  electronTtsSetConfig,
  electronTtsSetEngine,
  electronTtsStart,
  electronTtsStop,
} from '../../../../shared/eventa'

const defaultEngineId = getDefaultEngineId()
const defaultEngine = getEngine(defaultEngineId)
const TTS_SIDECAR_ID = defaultEngine?.sidecarId ?? defaultEngineId

const invokeStart = useElectronEventaInvoke(electronTtsStart)
const invokeStop = useElectronEventaInvoke(electronTtsStop)
const invokeStatus = useElectronEventaInvoke(electronSidecarStatus)
const invokeGetEngines = useElectronEventaInvoke(electronTtsGetEngines)
const invokeSetEngine = useElectronEventaInvoke(electronTtsSetEngine)
const invokeCurrentEngine = useElectronEventaInvoke(electronTtsCurrentEngine)
const invokeSetConfig = useElectronEventaInvoke(electronTtsSetConfig)
const invokeGetConfig = useElectronEventaInvoke(electronTtsGetConfig)
const invokeChooseDirectory = useElectronEventaInvoke(electronDialogChooseDirectory)
const invokeChooseFile = useElectronEventaInvoke(electronDialogChooseFile)
const invokeCloneVoice = useElectronEventaInvoke(electronTtsCloneVoice)
const invokeRemoveVoice = useElectronEventaInvoke(electronTtsRemoveVoice)
const invokeListVoices = useElectronEventaInvoke(electronTtsListVoices)

const PANEL = 'settings-panel'
const CARD = 'settings-card'

const allStatuses = ref<SidecarStatus[]>([])
const starting = ref(false)
const stopping = ref(false)
const switchingEngine = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')
const needsRestartNotice = ref(false)
const installProgress = ref('')

// GPT-SoVITS 安装目录、端口与设备配置（进入页面时通过 electronTtsGetConfig 回显检测/保存的值）
const dirInput = ref('')
const portInput = ref<number | undefined>(undefined)
const deviceInput = ref<string>('auto')
const saving = ref(false)
const savingPort = ref(false)
const picking = ref(false)

// TTS 引擎选择状态
const engines = ref<TtsEngineInfo[]>([])
const currentEngine = ref<TtsEngine>(defaultEngineId as TtsEngine)

// 克隆声线状态
interface VoiceItem {
  id: string
  name: string
  lang: string
  is_cloned?: boolean
  base_character?: string
}
const voices = ref<VoiceItem[]>([])
const cloningVoice = ref(false)
const removingVoiceName = ref('')
const pickingAudio = ref(false)
const cloneCharaName = ref('')
const cloneAudioPath = ref('')
const cloneAudioText = ref('')
const cloneLanguage = ref<'Chinese' | 'Japanese' | 'English'>('Chinese')

const CLONE_LANGUAGE_OPTIONS = [
  { label: '中文', value: 'Chinese' },
  { label: '日本語', value: 'Japanese' },
  { label: 'English', value: 'English' },
]

const DEVICE_OPTIONS = [
  { label: '自动（推荐）', value: 'auto', description: 'CUDA 可用时用半精度，否则用 CPU' },
  { label: 'CPU（显存 0GB）', value: 'cpu', description: '使用 CPU 推理，速度较慢' },
  { label: 'GPU 半精度（~1.5GB）', value: 'cuda-half', description: '使用 GPU 半精度，速度较快' },
  { label: 'GPU 全精度（~3-4GB）', value: 'cuda', description: '使用 GPU 全精度，音质最佳' },
]

const STATE_BADGE: Record<SidecarState, string> = {
  running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  starting: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  stopping: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  stopped: 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  degraded: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

const STATE_LABEL: Record<SidecarState, string> = {
  running: '运行中',
  starting: '启动中',
  stopping: '停止中',
  stopped: '已停止',
  error: '错误',
  degraded: '降级',
}

const ENGINE_LABEL: Record<TtsEngine, string> = Object.fromEntries(
  listEngines().map(engine => [engine.id, engine.name]),
) as Record<TtsEngine, string>

const ttsStatus = computed(() => allStatuses.value.find(s => s.id === TTS_SIDECAR_ID) ?? null)
const currentState = computed<SidecarState>(() => ttsStatus.value?.state ?? 'stopped')
const isRunning = computed(() => currentState.value === 'running' || currentState.value === 'starting')
const isBusy = computed(() => starting.value || stopping.value)

const isPortValid = computed(() => {
  const p = portInput.value
  return p !== undefined && Number.isInteger(p) && p >= 1024 && p <= 65535
})

// FieldSelect 选项：不可用引擎置为 disabled，避免用户选择无法工作的引擎
const engineOptions = computed(() => engines.value.map(engine => ({
  label: engine.name,
  value: engine.id,
  description: engine.available ? '可用' : '不可用',
  disabled: !engine.available,
})))

// FieldSelect v-model 绑定：乐观更新本地状态，后端持久化失败时回滚
const engineModel = computed<TtsEngine>({
  get: () => currentEngine.value,
  set: async (value) => {
    if (!value || value === currentEngine.value)
      return
    const previous = currentEngine.value
    clearMessages()
    switchingEngine.value = true
    // 乐观更新：避免 Select 在 await 期间因 getter 返回旧值而闪烁
    currentEngine.value = value
    try {
      await invokeSetEngine({ engine: value })
      infoMessage.value = `TTS 引擎已切换为 ${ENGINE_LABEL[value]}`
    }
    catch (e) {
      // 后端持久化失败，回滚到切换前的值
      currentEngine.value = previous
      setError(e)
    }
    finally {
      switchingEngine.value = false
    }
  },
})

const deviceModel = computed<string>({
  get: () => deviceInput.value,
  set: async (value) => {
    if (!value || value === deviceInput.value)
      return
    deviceInput.value = value
    clearMessages()
    try {
      const result = await invokeSetConfig({ device: deviceInput.value })
      if (result.needsRestart) {
        needsRestartNotice.value = true
        infoMessage.value = '设备配置已保存。GPT-SoVITS 正在运行，需重启才能生效。'
      }
      else {
        infoMessage.value = '设备配置已保存。'
      }
    }
    catch (e) {
      setError(e)
    }
  },
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
    const list = await invokeStatus()
    allStatuses.value = list ?? []
  }
  catch (e) {
    setError(e)
  }
}

async function refreshEngines() {
  try {
    const [list, current] = await Promise.all([
      invokeGetEngines(),
      invokeCurrentEngine(),
    ])
    engines.value = list ?? []
    currentEngine.value = current ?? defaultEngineId
  }
  catch (e) {
    setError(e)
  }
}

async function refreshConfig() {
  try {
    const config = await invokeGetConfig()
    if (config?.dataDir)
      dirInput.value = config.dataDir
    if (config?.port !== undefined)
      portInput.value = config.port
    if (config?.device)
      deviceInput.value = config.device
  }
  catch (e) {
    setError(e)
  }
}

async function startTts() {
  clearMessages()
  installProgress.value = ''
  starting.value = true
  try {
    const result = await invokeStart()
    if (!result.success) {
      errorMessage.value = result.message || 'GPT-SoVITS 启动失败'
      return
    }
    infoMessage.value = result.message || 'GPT-SoVITS 启动指令已发送'
    // 专用 IPC 不返回 SidecarStatus，主动刷新以同步状态徽标
    void refreshStatus()
  }
  catch (e) {
    setError(e)
  }
  finally {
    starting.value = false
    installProgress.value = ''
  }
}

async function stopTts() {
  clearMessages()
  stopping.value = true
  try {
    const result = await invokeStop()
    if (!result.success) {
      errorMessage.value = result.message || 'GPT-SoVITS 停止失败'
      return
    }
    infoMessage.value = result.message || 'GPT-SoVITS 已停止'
    void refreshStatus()
  }
  catch (e) {
    setError(e)
  }
  finally {
    stopping.value = false
  }
}

async function chooseDirectory() {
  clearMessages()
  picking.value = true
  try {
    const result = await invokeChooseDirectory({ title: '选择 GPT-SoVITS 数据目录' })
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
    errorMessage.value = '请先选择或输入 GPT-SoVITS 数据目录'
    return
  }
  clearMessages()
  saving.value = true
  try {
    const result = await invokeSetConfig({ dir: dirInput.value.trim() })
    if (result.needsRestart) {
      needsRestartNotice.value = true
      infoMessage.value = '路径已保存。GPT-SoVITS 正在运行，需重启才能生效。'
    }
    else {
      infoMessage.value = '路径已保存。'
    }
    // 路径变更后 GPT-SoVITS 可用性可能改变，刷新引擎列表
    void refreshEngines()
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
      infoMessage.value = '端口已保存。GPT-SoVITS 正在运行，需重启才能生效。'
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

function formatUpdatedAt(ts: number): string {
  return new Date(ts).toLocaleString()
}

// 克隆声线：从 sidecar 拉取当前已注册的预定义 + 克隆声线列表
async function refreshVoices() {
  try {
    const result = await invokeListVoices()
    voices.value = result?.voices ?? []
  }
  catch (e) {
    // 列表刷新失败不阻塞页面其他功能
    console.warn('[tts-section] list voices failed:', e)
  }
}

// 弹出系统文件选择对话框，限制音频扩展名（wav/mp3/flac/m4a/ogg/aac）
async function chooseAudioFile() {
  clearMessages()
  pickingAudio.value = true
  try {
    const result = await invokeChooseFile({
      title: '选择参考音频文件（建议 5-10 秒清晰人声）',
      extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac'],
    })
    if (!result.canceled && result.path)
      cloneAudioPath.value = result.path
  }
  catch (e) {
    setError(e)
  }
  finally {
    pickingAudio.value = false
  }
}

// 提交克隆：调用 sidecar set_reference_audio 注册自定义声线
async function cloneVoiceAction() {
  if (!cloneCharaName.value.trim()) {
    errorMessage.value = '请输入克隆声线名称'
    return
  }
  if (!cloneAudioPath.value.trim()) {
    errorMessage.value = '请先选择参考音频文件'
    return
  }
  if (!cloneAudioText.value.trim()) {
    errorMessage.value = '请填写参考音频对应的文本（用于提升克隆质量）'
    return
  }
  clearMessages()
  cloningVoice.value = true
  try {
    const result = await invokeCloneVoice({
      characterName: cloneCharaName.value.trim(),
      audioPath: cloneAudioPath.value.trim(),
      audioText: cloneAudioText.value.trim(),
      language: cloneLanguage.value,
    })
    if (!result.success) {
      errorMessage.value = result.error || '克隆声线失败'
      return
    }
    infoMessage.value = `声线「${result.characterName}」克隆成功`
    // 清空表单 + 刷新列表
    cloneCharaName.value = ''
    cloneAudioPath.value = ''
    cloneAudioText.value = ''
    void refreshVoices()
  }
  catch (e) {
    setError(e)
  }
  finally {
    cloningVoice.value = false
  }
}

// 删除已克隆声线（预定义角色不允许删除）
async function removeVoiceAction(voice: VoiceItem) {
  if (voice.is_cloned !== true) {
    errorMessage.value = '预定义角色不可删除'
    return
  }
  clearMessages()
  removingVoiceName.value = voice.id
  try {
    const result = await invokeRemoveVoice({ characterName: voice.id })
    if (!result.success) {
      errorMessage.value = result.error || '删除声线失败'
      return
    }
    infoMessage.value = `声线「${voice.id}」已删除`
    void refreshVoices()
  }
  catch (e) {
    setError(e)
  }
  finally {
    removingVoiceName.value = ''
  }
}

// 订阅 sidecar 状态变化事件
let eventaContext: ReturnType<typeof getElectronEventaContext> | undefined
try {
  eventaContext = getElectronEventaContext()
}
catch (e) {
  console.warn('[tts-section] IPC bridge unavailable:', e)
}
const offStatusChanged = eventaContext?.on(electronSidecarStatusChanged, (event) => {
  if (!event?.body)
    return
  const next = event.body
  const idx = allStatuses.value.findIndex(s => s.id === next.id)
  if (idx >= 0)
    allStatuses.value[idx] = next
  else
    allStatuses.value = [...allStatuses.value, next]
  // GPT-SoVITS 状态变化会影响引擎可用性，重新拉取引擎列表
  if (next.id === TTS_SIDECAR_ID) {
    void refreshEngines()
    // GPT-SoVITS 状态变化（启动完成、停止）后声线列表可能更新，刷新一次
    void refreshVoices()
  }
})
const offInstallProgress = eventaContext?.on(electronTtsInstallProgress, (event) => {
  if (event?.body?.message)
    installProgress.value = event.body.message
})
onScopeDispose(() => {
  offStatusChanged?.()
  offInstallProgress?.()
})

onMounted(() => {
  void refreshStatus()
  void refreshEngines()
  void refreshConfig()
  void refreshVoices()
})
</script>

<template>
  <section :class="PANEL">
    <div class="flex items-center justify-between gap-2 flex-wrap">
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-semibold">
          GPT-SoVITS（语音合成）
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          本地 TTS 子进程，通过 stdin/stdout JSON-RPC 管道与主进程通信
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
    <Callout v-if="installProgress" theme="primary" label="安装进度">
      {{ installProgress }}
    </Callout>
    <Callout v-if="needsRestartNotice && !infoMessage" theme="orange">
      配置已变更，需重启 GPT-SoVITS 才能生效。
    </Callout>

    <!-- 安装目录配置 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          安装目录
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          指向 GPT-SoVITS 数据目录（GPT-SoVITS Data 目录路径）
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
          GPT-SoVITS 监听端口（范围 1024-65535，默认 9880）；修改后需重启 GPT-SoVITS 生效
        </span>
      </div>
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <FieldInput
            v-model="portInput"
            type="number"
            placeholder="9880"
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

    <!-- 设备配置 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          推理设备
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          CPU 模式显存占用为 0，半精度 GPU 模式约 1.5-2GB，全精度 GPU 模式约 3-4GB；修改后需重启 GPT-SoVITS 生效
        </span>
      </div>
      <FieldSelect
        v-model="deviceModel"
        label="推理设备"
        layout="vertical"
        :options="DEVICE_OPTIONS"
        select-class="w-full"
      />
    </div>

    <!-- 运行状态详情 -->
    <div :class="CARD">
      <div class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
        运行状态
      </div>
      <div v-if="ttsStatus" class="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-300">
        <div class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">PID:</span>
          <span class="font-mono">{{ ttsStatus.pid ?? '-' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">重启次数:</span>
          <span>{{ ttsStatus.restartCount }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-neutral-500 dark:text-neutral-400">最后更新:</span>
          <span>{{ formatUpdatedAt(ttsStatus.updatedAt) }}</span>
        </div>
        <div v-if="ttsStatus.lastError" class="break-all text-red-600 dark:text-red-400">
          <span class="font-medium">错误:</span> {{ ttsStatus.lastError }}
        </div>
      </div>
      <div v-else class="text-xs text-neutral-500 dark:text-neutral-400">
        GPT-SoVITS 尚未注册到 SidecarService，点击「启动」开始服务。
      </div>
    </div>

    <!-- TTS 引擎选择 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          TTS 引擎
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          GPT-SoVITS 不可用时可选 Edge TTS 或系统 TTS 降级
        </span>
      </div>
      <FieldSelect
        v-model="engineModel"
        label="当前引擎"
        layout="vertical"
        :options="engineOptions"
        :disabled="switchingEngine"
        select-class="w-full"
      />
      <!-- 引擎可用性列表 -->
      <div class="flex flex-col gap-1">
        <div
          v-for="engine in engines"
          :key="engine.id"
          :class="[
            'flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs',
            engine.available
              ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
              : 'bg-neutral-400/5 text-neutral-500 dark:text-neutral-400',
          ]"
        >
          <span class="flex flex-col gap-0.5">
            <span class="flex items-center gap-1.5">
              <span
                :class="[
                  'size-1.5 rounded-full',
                  engine.available ? 'bg-emerald-500' : 'bg-neutral-400',
                ]"
              />
              {{ engine.name }}
            </span>
            <span
              v-if="!engine.available && engine.reason"
              class="pl-3 text-[10px] text-neutral-400 dark:text-neutral-500"
            >
              {{ engine.reason }}
            </span>
          </span>
          <span class="text-[10px] font-medium tracking-wide uppercase">
            {{ engine.available ? '可用' : '不可用' }}
          </span>
        </div>
        <div v-if="engines.length === 0" class="text-[10px] text-neutral-500 dark:text-neutral-400">
          正在加载引擎列表...
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center justify-end gap-2">
      <Button
        v-if="!isRunning"
        variant="primary" size="sm"
        :loading="starting"
        :disabled="isBusy"
        label="启动"
        icon="i-solar:play-bold-duotone"
        @click="startTts"
      />
      <Button
        v-else
        variant="danger" size="sm"
        :loading="stopping"
        :disabled="isBusy"
        label="停止"
        icon="i-solar:stop-bold-duotone"
        @click="stopTts"
      />
    </div>

    <!-- 克隆声线 -->
    <div :class="CARD">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          声线克隆
        </span>
        <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
          上传一段 5-10 秒清晰人声音频 + 文本标注，自动克隆目标声线；克隆声线复用预定义角色的 T2S/VITS 模型，仅替换参考音频。
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <!-- 角色名 -->
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
            克隆声线名称（自定义标识，TTS 合成时通过该名称引用）
          </span>
          <FieldInput
            v-model="cloneCharaName"
            type="text"
            placeholder="例如：my-voice-01"
          />
        </div>

        <!-- 参考音频文件 -->
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
            参考音频文件（wav/mp3/flac/m4a/ogg/aac，建议 5-10 秒清晰人声）
          </span>
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <FieldInput
                v-model="cloneAudioPath"
                type="text"
                placeholder="点击「选择音频」上传文件..."
                :disabled="true"
              />
            </div>
            <Button
              variant="secondary" size="md"
              :loading="pickingAudio"
              :disabled="pickingAudio || cloningVoice"
              label="选择音频"
              icon="i-solar:gallery-bold-duotone"
              @click="chooseAudioFile"
            />
          </div>
        </div>

        <!-- 参考音频对应文本 -->
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
            参考音频对应文本（与音频内容一致，用于提升克隆质量）
          </span>
          <FieldInput
            v-model="cloneAudioText"
            type="text"
            placeholder="例如：大家好，欢迎收听本期节目。"
          />
        </div>

        <!-- 语言选择 -->
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-neutral-500 dark:text-neutral-400">
            参考音频语言（决定克隆声线复用哪个预定义角色模型）
          </span>
          <FieldSelect
            v-model="cloneLanguage"
            label="参考音频语言"
            layout="vertical"
            :options="CLONE_LANGUAGE_OPTIONS"
            select-class="w-full"
          />
        </div>

        <div class="flex items-center justify-end">
          <Button
            variant="primary" size="md"
            :loading="cloningVoice"
            :disabled="cloningVoice || !cloneCharaName.trim() || !cloneAudioPath.trim() || !cloneAudioText.trim()"
            label="克隆声线"
            icon="i-solar:copy-bold-duotone"
            @click="cloneVoiceAction"
          />
        </div>
      </div>

      <!-- 已注册声线列表 -->
      <div class="flex flex-col gap-1 mt-1">
        <span class="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
          已注册声线
        </span>
        <div v-if="voices.length === 0" class="text-[10px] text-neutral-500 dark:text-neutral-400">
          暂无声线（启动 GPT-SoVITS 后将自动加载预定义角色）
        </div>
        <div v-else class="flex flex-col gap-1">
          <div
            v-for="voice in voices"
            :key="voice.id"
            :class="[
              'flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs',
              voice.is_cloned
                ? 'bg-sky-500/5 text-sky-700 dark:text-sky-300'
                : 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
            ]"
          >
            <div class="flex flex-col gap-0.5">
              <div class="flex items-center gap-1.5">
                <span
                  :class="[
                    'size-1.5 rounded-full',
                    voice.is_cloned ? 'bg-sky-500' : 'bg-emerald-500',
                  ]"
                />
                <span class="font-medium">{{ voice.name }}</span>
                <span
                  class="text-[9px] font-medium tracking-wide uppercase rounded px-1 py-0.5"
                  :class="voice.is_cloned
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'"
                >
                  {{ voice.is_cloned ? '克隆' : '预定义' }}
                </span>
              </div>
              <div class="pl-3 text-[10px] text-neutral-400 dark:text-neutral-500">
                语言: {{ voice.lang }}<span v-if="voice.is_cloned && voice.base_character"> · 复用: {{ voice.base_character }}</span>
              </div>
            </div>
            <Button
              v-if="voice.is_cloned"
              variant="danger" size="sm"
              :loading="removingVoiceName === voice.id"
              :disabled="removingVoiceName === voice.id"
              label="删除"
              icon="i-solar:trash-bin-trash-bold-duotone"
              @click="removeVoiceAction(voice)"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
