<script setup lang="ts">
import type { ModelInfo } from '../../../libs/providers/types'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'

import { useBreakpoints } from '../../../composables/use-breakpoints'
import { RadioCardManySelect } from '../../menu'

defineProps<{
  title: string
  subtitle?: string
  currentModelLabel?: string
  currentModel?: string
  items: ModelInfo[]
  loading: boolean
  error?: string
  supportsModelListing: boolean
  searchPlaceholder: string
  searchNoResultsTitle: string
  searchNoResultsDescription: string
  searchResultsText: string
  customInputPlaceholder?: string
  expandButtonText?: string
  collapseButtonText?: string
  allowCustom?: boolean
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'update:searchQuery', value: string): void
  (e: 'update:customValue', value: string): void
}>()

const showDialog = defineModel('open', { type: Boolean, default: false })
const modelValue = defineModel('modelValue', { type: String, default: '' })
const searchQuery = defineModel('searchQuery', { type: String, default: '' })

const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

function handleSelect(value: string) {
  modelValue.value = value
  showDialog.value = false
}

function handleCustomValue(value: string) {
  emits('update:customValue', value)
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <slot name="trigger" />
    <DialogPortal v-if="showDialog">
      <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-[85dvh] max-w-3xl w-[92dvw] transform overflow-y-auto rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <VisuallyHidden>
          <DialogTitle>{{ title }}</DialogTitle>
        </VisuallyHidden>
        <div flex="~ col gap-4" h-full>
          <div>
            <h2 class="text-lg md:text-2xl">
              {{ title }}
            </h2>
            <div class="flex flex-col items-start gap-1 text-neutral-400 md:flex-row md:items-center md:justify-between dark:text-neutral-400">
              <span>{{ subtitle }}</span>
              <span v-if="currentModel && currentModelLabel" class="text-sm text-neutral-400 font-medium dark:text-neutral-400">{{ currentModelLabel }} {{ currentModel }}</span>
            </div>
          </div>

          <div v-if="loading" class="flex items-center justify-center py-4">
            <div class="mr-2 animate-spin">
              <div i-solar:spinner-line-duotone text-xl />
            </div>
            <span>Loading models...</span>
          </div>

          <template v-else>
            <RadioCardManySelect
              v-if="supportsModelListing"
              v-model="modelValue"
              v-model:search-query="searchQuery"
              :items="items"
              :searchable="true"
              :allow-custom="allowCustom"
              :search-placeholder="searchPlaceholder"
              :search-no-results-title="searchNoResultsTitle"
              :search-no-results-description="searchNoResultsDescription"
              :search-results-text="searchResultsText"
              :custom-input-placeholder="customInputPlaceholder"
              :expand-button-text="expandButtonText"
              :collapse-button-text="collapseButtonText"
              expanded-class="mb-12"
              @update:model-value="handleSelect"
              @update:custom-value="handleCustomValue"
            />
            <slot v-else name="no-model-listing" />
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <slot name="trigger" />
    <DrawerPortal v-if="showDialog">
      <DrawerOverlay class="fixed inset-0" />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000',
          'mt-20 px-4 pt-4',
          'flex flex-col',
          'h-full max-h-[85%]',
          'rounded-t-[32px] outline-none backdrop-blur-md',
          'bg-neutral-50/85 dark:bg-neutral-900/90',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle />
        <div flex="~ col gap-4" h-full>
          <div>
            <h2 class="text-lg">
              {{ title }}
            </h2>
            <div class="text-sm text-neutral-400 dark:text-neutral-400">
              <span>{{ subtitle }}</span>
              <span v-if="currentModel && currentModelLabel" class="ml-2 font-medium">{{ currentModelLabel }} {{ currentModel }}</span>
            </div>
          </div>

          <div v-if="loading" class="flex items-center justify-center py-4">
            <div class="mr-2 animate-spin">
              <div i-solar:spinner-line-duotone text-lg />
            </div>
            <span>Loading models...</span>
          </div>

          <template v-else>
            <RadioCardManySelect
              v-if="supportsModelListing"
              v-model="modelValue"
              v-model:search-query="searchQuery"
              :items="items"
              :searchable="true"
              :allow-custom="allowCustom"
              :search-placeholder="searchPlaceholder"
              :search-no-results-title="searchNoResultsTitle"
              :search-no-results-description="searchNoResultsDescription"
              :search-results-text="searchResultsText"
              :custom-input-placeholder="customInputPlaceholder"
              :expand-button-text="expandButtonText"
              :collapse-button-text="collapseButtonText"
              expanded-class="mb-12"
              @update:model-value="handleSelect"
              @update:custom-value="handleCustomValue"
            />
            <slot v-else name="no-model-listing" />
          </template>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
