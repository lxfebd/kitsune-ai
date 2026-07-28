<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatSlicesText, ChatSlicesToolCallResult } from '../../../../types/chat'
import type { ChatToolCallRendererRegistry } from './tool-call-renderer'

import { isStageCapacitor, isStageWeb } from '@kitsune/stage-shared'
import { computed } from 'vue'

import ChatResponsePart from './response-part.vue'
import ChatToolCallBlock from './tool-call-block.vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'
import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  message: ChatAssistantMessage
  label: string
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
  toolCallRenderers?: ChatToolCallRendererRegistry
}>(), {
  showPlaceholder: false,
  variant: 'desktop',
  toolCallRenderers: () => ({}),
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
}>()

const resolvedSlices = computed<ChatSlices[]>(() => {
  if (props.message.slices?.length) {
    return props.message.slices
  }

  if (typeof props.message.content === 'string' && props.message.content.trim()) {
    return [{ type: 'text', text: props.message.content } satisfies ChatSlicesText]
  }

  if (Array.isArray(props.message.content)) {
    const textPart = props.message.content.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text)
      return [{ type: 'text', text: textPart.text } satisfies ChatSlicesText]
  }

  return []
})

const toolResultById = computed(() => {
  return createToolCallResultLookup(resolvedSlices.value, props.message.tool_results)
})

function getToolCallResult(slice: ChatSlices): ChatSlicesToolCallResult | undefined {
  if (slice.type !== 'tool-call') {
    return undefined
  }

  return toolResultById.value.get(slice.toolCall.toolCallId)
}

function getToolCallState(slice: ChatSlices): 'executing' | 'done' | 'error' {
  return resolveToolCallBlockState(getToolCallResult(slice))
}

function getToolCallRenderer(slice: ChatSlices) {
  if (slice.type !== 'tool-call') {
    return ChatToolCallBlock
  }

  return props.toolCallRenderers[slice.toolCall.toolName] ?? ChatToolCallBlock
}

const showLoader = computed(() => props.showPlaceholder && resolvedSlices.value.length === 0)
const containerClass = computed(() => props.variant === 'mobile' ? 'mr-0' : 'mr-12')
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div flex :class="containerClass" class="ph-no-capture">
    <ChatActionMenu
      :copy-text="copyText"
      :can-delete="!showPlaceholder"
      @copy="emit('copy')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div class="flex items-start gap-3">
          <!-- 角色头像 - 月读主题 -->
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/60 dark:to-primary-800/60 shadow-sm">
            <div class="i-solar:moon-fog-bold-duotone text-primary-600 dark:text-primary-300 text-base" />
          </div>
          <div
            :ref="setMeasuredElement"
            flex="~ col"
            min-w-20 gap-1.5 rounded-2xl h="unset <sm:fit flex-1"
            :class="[
              'px-4 py-3 bg-primary-50/60 dark:bg-primary-950/50 backdrop-blur-xl border border-primary-100/50 dark:border-primary-900/30 shadow-sm',
              (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
            ]"
          >
            <!-- 标签 + 时间戳 -->
            <div class="flex items-center gap-2">
              <span text-xs font-medium text="primary-600 dark:text-primary-300">{{ label }}</span>
              <span v-if="message.createdAt" text-[10px] text="black/25 dark:white/35">{{ new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <!-- 推理/reasoning 展示 -->
            <ChatResponsePart
              v-if="message.categorization"
              :message="message"
              :variant="variant"
            />
            <!-- 消息内容 -->
            <div v-if="resolvedSlices.length > 0" class="flex flex-col gap-2 break-words" text="primary-800 dark:primary-50" text-sm leading-relaxed>
              <template v-for="(slice, sliceIndex) in resolvedSlices" :key="sliceIndex">
                <component
                  :is="getToolCallRenderer(slice)"
                  v-if="slice.type === 'tool-call'"
                  :tool-name="slice.toolCall.toolName"
                  :args="slice.toolCall.args"
                  :state="getToolCallState(slice)"
                  :result="getToolCallResult(slice)?.result"
                />
                <template v-else-if="slice.type === 'tool-call-result'" />
                <template v-else-if="slice.type === 'text'">
                  <MarkdownRenderer :content="slice.text" />
                </template>
              </template>
            </div>
            <!-- 加载状态 -->
            <div v-else-if="showLoader" class="flex items-center gap-2 text-primary-400">
              <div class="i-eos-icons:three-dots-loading text-lg" />
              <span text-xs>{{ t('settings.chat.thinking') }}</span>
            </div>
          </div>
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
