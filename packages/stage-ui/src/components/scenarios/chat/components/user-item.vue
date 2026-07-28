<script setup lang="ts">
import type { ChatHistoryItem, ChatMessage } from '../../../../types/chat'

import { isStageCapacitor, isStageWeb } from '@kitsune/stage-shared'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../../markdown'
import { ChatActionMenu } from '../components/action-menu'
import { getChatHistoryItemCopyText } from '../utils'

const props = withDefaults(defineProps<{
  message: Extract<ChatMessage, { role: 'user' }>
  label: string
  variant?: 'desktop' | 'mobile'
}>(), {
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'delete'): void
}>()

const content = computed(() => {
  const raw = props.message.content
  if (typeof raw === 'string')
    return raw

  if (Array.isArray(raw)) {
    const textPart = raw.find(part => 'type' in part && part.type === 'text') as { text?: string } | undefined
    if (textPart?.text)
      return textPart.text

    return raw.map(entry => JSON.stringify(entry)).join('\n')
  }

  return ''
})

const containerClasses = computed(() => [
  'flex',
  props.variant === 'mobile' ? 'ml-0 flex-row' : 'ml-12 flex-row-reverse',
])

const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div v-if="message.role === 'user'" :class="containerClasses" class="ph-no-capture">
    <ChatActionMenu
      :copy-text="copyText"
      placement="left"
      @copy="emit('copy')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div class="flex items-start gap-3 flex-row-reverse">
          <!-- 用户头像 -->
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-600 dark:to-neutral-700 shadow-sm">
            <div class="i-solar:user-bold-duotone text-neutral-600 dark:text-neutral-200 text-base" />
          </div>
          <div
            :ref="setMeasuredElement"
            flex="~ col"
            min-w-20 rounded-2xl h="unset <sm:fit flex-1"
            :class="[
              'px-4 py-3 bg-white/80 dark:bg-neutral-800/60 backdrop-blur-xl border border-black/5 dark:border-white/5 shadow-sm',
              (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
            ]"
          >
            <!-- 标签 + 时间戳 -->
            <div class="flex items-center gap-2 flex-row-reverse">
              <span text-xs font-medium text="neutral-600 dark:text-neutral-300">{{ label }}</span>
              <span v-if="message.createdAt" text-[10px] text="black/25 dark:white/35">{{ new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <!-- 消息内容 -->
            <MarkdownRenderer
              :content="content as string"
              class="break-words"
              text-sm leading-relaxed text="neutral-800 dark:neutral-100"
            />
          </div>
        </div>
      </template>
    </ChatActionMenu>
  </div>
</template>
