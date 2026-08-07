<script setup lang="ts">
import type { ChatToolCallRendererRegistry } from '@kitsune/stage-ui/components'
import type { ChatHistoryItem } from '@kitsune/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'
import { useStopSpeakingButton } from '@kitsune/stage-layouts/composables/useStopSpeakingButton'
import { ChatHistory, JournalPreviewModal } from '@kitsune/stage-ui/components'
import { useAnalytics } from '@kitsune/stage-ui/composables/use-analytics'
import { useVAD } from '@kitsune/stage-ui/stores/ai/models/vad'
import { useBackgroundStore } from '@kitsune/stage-ui/stores/background'
import { useChatOrchestratorStore } from '@kitsune/stage-ui/stores/chat'
import { useChatSessionStore } from '@kitsune/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@kitsune/stage-ui/stores/chat/stream-store'
import { useHearingSpeechInputPipeline } from '@kitsune/stage-ui/stores/modules/hearing'
import { useJournalPreviewStore } from '@kitsune/stage-ui/stores/journal-preview'
import { usePersonaStore } from '@kitsune/stage-ui/stores/modules/persona'
import { useSettingsAudioDevice } from '@kitsune/stage-ui/stores/settings'
import { BasicTextarea } from '@kitsune/ui'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import workletUrl from '@kitsune/stage-ui/workers/vad/process.worklet?worker&url'

import JournalToolCallBlock from './chat-tool-renderers/journal-tool-call-block.vue'

import { useChatSyncStore } from '../stores/chat-sync'

const router = useRouter()
const messageInput = ref('')
const lastEnterTime = ref(0)
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])
const inputFocused = ref(false)

const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const chatSyncStore = useChatSyncStore()
const backgroundStore = useBackgroundStore()
const journalPreviewStore = useJournalPreviewStore()
const personaStore = usePersonaStore()

const { messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { sending } = storeToRefs(chatOrchestrator)
const { activeCardId } = storeToRefs(personaStore)
const { t } = useI18n()
const { openImagePreview } = journalPreviewStore
const isComposing = ref(false)

// --- ASR 语音输入 ---
const audioDeviceStore = useSettingsAudioDevice()
const { enabled: audioInputEnabled, stream } = storeToRefs(audioDeviceStore)

const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && stream.value)

const { init: initVAD, dispose: disposeVAD, start: startVAD } = useVAD(workletUrl, {
  threshold: ref(0.5),
  onSpeechStart: () => { },
  onSpeechEnd: () => { },
})
const hearingActive = ref(false)

async function startHearing() {
  try {
    await audioDeviceStore.askPermission()
    audioInputEnabled.value = true
    if (stream.value) {
      await initVAD()
      startVAD(stream.value)
      if (shouldUseStreamInput.value) {
        await transcribeForMediaStream(stream.value, {
          onSentenceEnd: (text: string) => {
            if (text.trim()) {
              messageInput.value = (messageInput.value ? messageInput.value + ' ' : '') + text.trim()
            }
          },
        })
      }
      hearingActive.value = true
    }
  }
  catch (e) {
    console.warn('[Chat] Failed to start hearing:', e)
    hearingActive.value = false
  }
}

function stopHearing() {
  audioInputEnabled.value = false
  void stopStreamingTranscription(true)
  disposeVAD()
  hearingActive.value = false
}

function toggleHearing() {
  if (hearingActive.value) {
    stopHearing()
  }
  else {
    void startHearing()
  }
}

onBeforeUnmount(() => {
  if (hearingActive.value) {
    stopHearing()
  }
})

const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const toolCallRenderers = {
  image_journal: JournalToolCallBlock,
  text_journal: JournalToolCallBlock,
} satisfies ChatToolCallRendererRegistry
const sendModeLabels = computed<Record<SendMode, string>>(() => ({
  'enter': t('stage.send-mode.enter'),
  'ctrl-enter': t('stage.send-mode.ctrl-enter'),
  'double-enter': t('stage.send-mode.double-enter'),
}))
const {
  trackChatMessageDeleted,
  trackChatMessageRetried,
  trackChatMessagesCleared,
} = useAnalytics()
const { showStopSpeakingButton, stopSpeakingFromChat } = useStopSpeakingButton()

const latestImageEntries = computed(() => {
  if (!activeCardId.value)
    return []
  return backgroundStore.journalEntries.slice(0, 3)
})

function navigateToImageJournal() {
  if (!activeCardId.value)
    return
  router.push(`/settings/kitsune-card?cardId=${activeCardId.value}&tab=gallery`)
}

async function handleSend() {
  if (isComposing.value)
    return

  if (!messageInput.value.trim() && !attachments.value.length)
    return

  const textToSend = messageInput.value
  const attachmentsToSend = attachments.value.map(att => ({ ...att }))

  messageInput.value = ''
  attachments.value = []

  try {
    await chatSyncStore.requestIngest({
      text: textToSend,
      attachments: attachmentsToSend,
      toolset: 'artistry',
    })
    attachmentsToSend.forEach(att => URL.revokeObjectURL(att.url))
  }
  catch (error) {
    messageInput.value = textToSend
    attachments.value = attachmentsToSend
    chatSession.setSessionMessages(chatSession.activeSessionId, [
      ...messages.value,
      {
        role: 'error',
        content: errorMessageFrom(error) ?? 'Failed to send message',
      },
    ])
  }
}

function sendFromKeyboard() {
  messageInput.value = messageInput.value.replace(TRAILING_NEWLINES_REGEX, '')
  void handleSend()
}

const fileInput = ref<HTMLInputElement | null>(null)

function handleManualAttach() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    handleFilePaste(Array.from(target.files))
  }
}

function handleMessageInputKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.key !== 'Enter')
    return

  const hasControl = event.ctrlKey || event.metaKey
  const hasShift = event.shiftKey

  switch (sendMode.value) {
    case 'enter':
      if (!hasShift && !hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'ctrl-enter':
      if (hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'double-enter':
      if (!hasShift && !hasControl) {
        const now = Date.now()
        if (now - lastEnterTime.value < DOUBLE_ENTER_INTERVAL_MS) {
          event.preventDefault()
          sendFromKeyboard()
          lastEnterTime.value = 0
        }
        else {
          lastEnterTime.value = now
        }
      }
  }
}

async function handleFilePaste(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1]
        if (base64Data) {
          attachments.value.push({
            type: 'image' as const,
            data: base64Data,
            mimeType: file.type,
            url: URL.createObjectURL(file),
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

function removeAttachment(index: number) {
  const attachment = attachments.value[index]
  if (attachment) {
    URL.revokeObjectURL(attachment.url)
    attachments.value.splice(index, 1)
  }
}

watch(sendMode, () => {
  lastEnterTime.value = 0
})

const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])

async function handleDeleteMessage(index: number) {
  const message = messages.value[index]
  await chatSyncStore.requestDeleteMessage({ index })
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
}

onMounted(() => {
  backgroundStore.initializeStore()
})

async function handleRetryMessage(index: number) {
  await chatSyncStore.requestRetry({
    sessionId: chatSession.activeSessionId,
    index,
  })
  trackChatMessageRetried({
    source: 'chat',
  } as unknown as { source: 'history' })
}

async function handleCleanupMessages() {
  const confirmed = window.confirm(t('stage.chat.confirm-clear'))
  if (!confirmed)
    return

  const messageCount = messages.value.filter(message => message.role !== 'system').length
  await chatSyncStore.requestCleanup()
  trackChatMessagesCleared({
    source: 'chat_controls',
    message_count: messageCount,
  })
}

const hasInput = computed(() => messageInput.value.trim().length > 0 || attachments.value.length > 0)
</script>

<template>
  <div class="h-full w-full flex flex-col text-neutral-800 dark:text-neutral-200">
    <!-- 消息历史 - 占满剩余空间 -->
    <div class="flex-1 overflow-hidden">
      <ChatHistory
        :messages="historyMessages"
        :sending="sending"
        :streaming-message="streamingMessage"
        :tool-call-renderers="toolCallRenderers"
        @delete-message="handleDeleteMessage($event.index)"
        @retry-message="handleRetryMessage($event.index)"
      />
    </div>

    <!-- Journal 缩略图条 - 紧凑水平滚动 -->
    <div v-if="latestImageEntries.length > 0" class="shrink-0 border-t border-black/[0.04] dark:border-white/[0.04] bg-black/[0.02] dark:bg-white/[0.02]">
      <div class="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-none">
        <div
          v-for="entry in latestImageEntries"
          :key="entry.id"
          class="group relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg transition-all hover:ring-2 hover:ring-primary-400/40"
          @click="openImagePreview(entry)"
        >
          <img :src="entry.url || ''" class="h-full w-full object-cover">
          <button
            class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
            :title="t('tamagotchi.stage.interactive-area.save')"
            @click.stop="journalPreviewStore.downloadImage(entry.url || '', entry.title)"
          >
            <div class="i-solar:download-minimalistic-bold-duotone text-xs text-white" />
          </button>
        </div>
      </div>
    </div>

    <!-- 底部输入区域 -->
    <div class="shrink-0 p-3 pt-2">
      <!-- 附件预览 - 紧凑水平滚动 -->
      <div v-if="attachments.length > 0" class="mb-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <div v-for="(attachment, index) in attachments" :key="index" class="group relative shrink-0">
          <img :src="attachment.url" class="h-14 w-14 rounded-xl object-cover ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
          <button
            class="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
            @click="removeAttachment(index)"
          >
            <div class="i-ph:x-bold text-[8px]" />
          </button>
        </div>
      </div>

      <!-- 输入容器 - 浮动圆角卡片 -->
      <div
        class="relative rounded-2xl transition-all duration-200"
        :class="inputFocused
          ? 'bg-white dark:bg-neutral-900 shadow-lg shadow-black/[0.08] dark:shadow-black/40 ring-1 ring-primary-400/20 dark:ring-primary-500/15'
          : 'bg-white/80 dark:bg-neutral-900/80 shadow-md shadow-black/[0.04] dark:shadow-black/20'"
      >
        <!-- 顶部工具栏 - 极简图标行 -->
        <div class="flex items-center gap-0.5 px-2 pt-1.5">
          <!-- 左侧：输入工具 -->
          <div class="flex items-center gap-0.5">
            <!-- 语音输入 -->
            <button
              class="group/btn relative flex h-7 w-7 items-center justify-center rounded-lg outline-none transition-all"
              :class="hearingActive
                ? 'bg-primary-500/10 text-primary-500 dark:text-primary-400'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'"
              :title="hearingActive ? '停止语音输入' : '语音输入'"
              @click="toggleHearing"
            >
              <Transition name="fade" mode="out-in">
                <div v-if="hearingActive" class="i-ph:microphone text-sm" />
                <div v-else class="i-ph:microphone-slash text-sm" />
              </Transition>
              <!-- 录音脉冲指示器 -->
              <span v-if="hearingActive" class="absolute -left-0.5 -top-0.5 h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
              </span>
            </button>

            <!-- 图片附件 -->
            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 dark:text-neutral-500 outline-none transition-colors hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              :title="t('stage.chat.attach-image')"
              @click="handleManualAttach"
            >
              <div class="i-solar:gallery-add-bold-duotone text-sm" />
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              multiple
              @change="handleFileSelect"
            >
          </div>

          <div class="flex-1" />

          <!-- 右侧：设置工具 -->
          <div class="flex items-center gap-0.5">
            <!-- 停止播放 -->
            <button
              v-if="showStopSpeakingButton"
              class="flex h-7 w-7 items-center justify-center rounded-lg text-amber-400 outline-none transition-colors hover:text-amber-500 hover:bg-amber-500/[0.06]"
              :title="t('stage.chat.stop-speaking')"
              @click="stopSpeakingFromChat"
            >
              <div class="i-solar:stop-circle-bold-duotone text-sm" />
            </button>

            <!-- 发送模式 -->
            <DropdownMenuRoot>
              <DropdownMenuTrigger as-child>
                <button
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 dark:text-neutral-500 outline-none transition-colors hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                  :title="t('stage.send-mode.title')"
                >
                  <div class="i-solar:keyboard-bold-duotone text-sm" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  :side-offset="8"
                  class="z-50 min-w-[160px] rounded-xl p-1 shadow-xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-2xl border border-black/[0.06] dark:border-white/[0.06]"
                >
                  <DropdownMenuItem
                    v-for="mode in SEND_MODES"
                    :key="mode"
                    class="w-full flex cursor-pointer items-center rounded-lg px-3 py-1.5 text-left text-xs outline-none transition-colors"
                    :class="sendMode === mode ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'"
                    @select="sendMode = mode"
                  >
                    <div class="mr-2 h-3.5 w-3.5 flex shrink-0 items-center justify-center">
                      <div v-if="sendMode === mode" class="i-ph:check-bold text-xs text-primary-500" />
                    </div>
                    <span>{{ sendModeLabels[mode] }}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>

            <!-- 图库 -->
            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 dark:text-neutral-500 outline-none transition-colors hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              :title="t('stage.chat.image-journal')"
              @click="navigateToImageJournal"
            >
              <div class="i-solar:gallery-bold-duotone text-sm" />
            </button>

            <!-- 清空 -->
            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 dark:text-neutral-600 outline-none transition-colors hover:text-red-400 dark:hover:text-red-500 hover:bg-red-500/[0.06]"
              :title="t('stage.chat.clear-messages')"
              @click="handleCleanupMessages"
            >
              <div class="i-solar:trash-bin-2-bold-duotone text-sm" />
            </button>
          </div>
        </div>

        <!-- 输入框 + 发送按钮 -->
        <div class="flex items-end gap-1.5 px-2 pb-2 pt-1">
          <BasicTextarea
            v-model="messageInput"
            :submit-on-enter="false"
            :placeholder="t('stage.message')"
            class="min-h-[28px] max-h-[100px] flex-1 resize-none border-0! bg-transparent! px-1.5 py-0.5 text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-200 placeholder-neutral-300 dark:placeholder-neutral-600 focus:ring-0!"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            @keydown="handleMessageInputKeydown"
            @paste-file="handleFilePaste"
          />

          <!-- 发送按钮 - 圆形渐变 -->
          <button
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-all duration-200"
            :class="hasInput
              ? 'bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-md shadow-primary-500/30 hover:shadow-lg hover:shadow-primary-500/40 hover:scale-105 active:scale-95'
              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600'"
            :disabled="!hasInput"
            :title="t('stage.chat.send')"
            @click="sendFromKeyboard"
          >
            <div v-if="sending" class="i-svg-spinners:90-ring-with-bg text-sm" />
            <div v-else class="i-ph:arrow-up-bold text-sm" />
          </button>
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="mt-1.5 text-center">
        <span class="text-[10px] text-neutral-300 dark:text-neutral-600">Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>

    <!-- Shared Preview Modal -->
    <JournalPreviewModal />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
