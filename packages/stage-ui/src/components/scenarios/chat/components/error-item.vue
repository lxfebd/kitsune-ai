<script setup lang="ts">
import type { ChatHistoryItem, ErrorMessage } from '../../../../types/chat'

import { isStageCapacitor, isStageWeb } from '@kitsune/stage-shared'
import { Button } from '@kitsune/ui'
import { computed } from 'vue'

import { MarkdownRenderer } from '../../../markdown'
import { getChatHistoryItemCopyText } from '../utils'
import { ChatActionMenu } from './action-menu'

const props = withDefaults(defineProps<{
  message: ErrorMessage
  label: string
  retryLabel?: string
  canRetry?: boolean
  showPlaceholder?: boolean
  variant?: 'desktop' | 'mobile'
}>(), {
  canRetry: false,
  showPlaceholder: false,
  variant: 'desktop',
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'delete'): void
}>()

const boxClasses = computed(() => [
  'min-w-0',
  'max-w-full',
  props.variant === 'mobile' ? 'px-2 py-2 text-sm' : 'px-3 py-3',
])
const copyText = computed(() => getChatHistoryItemCopyText(props.message as ChatHistoryItem))
</script>

<template>
  <div
    :class="[
      'flex flex-col',
      variant === 'mobile' ? 'mr-0' : 'mr-12',
    ]"
  >
    <ChatActionMenu
      :copy-text="copyText"
      :can-delete="!showPlaceholder"
      :can-retry="canRetry && !showPlaceholder"
      @copy="emit('copy')"
      @retry="emit('retry')"
      @delete="emit('delete')"
    >
      <template #default="{ setMeasuredElement }">
        <div class="flex items-start gap-3">
          <!-- 错误图标 -->
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/60 dark:to-red-800/60 shadow-sm">
            <div class="i-solar:danger-triangle-bold-duotone text-red-500 dark:text-red-400 text-base" />
          </div>
          <div
            :ref="setMeasuredElement"
            :class="[
              boxClasses,
              'relative',
              'flex flex-col',
              'min-w-20 rounded-2xl flex-1',
              'h-unset <sm:h-fit',
              'shadow-sm',
              'bg-red-50/70 dark:bg-red-950/60 backdrop-blur-xl border border-red-100/50 dark:border-red-900/30',
              (isStageWeb() || isStageCapacitor()) && props.variant === 'mobile' ? 'select-none sm:select-auto' : '',
            ]"
          >
            <div class="flex items-center gap-2">
              <span text-xs font-medium text="red-600 dark:text-red-300">{{ label }}</span>
            </div>
            <div v-if="showPlaceholder" class="flex items-center gap-2 text-red-400">
              <div class="i-eos-icons:three-dots-loading text-lg" />
            </div>
            <MarkdownRenderer
              v-else
              :content="message.content"
              class="whitespace-pre-wrap break-all text-sm leading-relaxed text-red-600 dark:text-red-300"
            />
          </div>
        </div>
      </template>
    </ChatActionMenu>
    <div
      v-if="canRetry && !showPlaceholder"
      class="ml-12 mt-1"
    >
      <Button
        size="sm"
        variant="ghost"
        shape="square"
        icon="i-solar:refresh-bold"
        :aria-label="retryLabel"
        @click="emit('retry')"
      />
    </div>
  </div>
</template>
