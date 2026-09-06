<script setup lang="ts">
import type { Live2DValidationReport } from '@kitsune/stage-ui-live2d'

import { Button } from '@kitsune/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  report: Live2DValidationReport | null
}>()

const emits = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
  (e: 'fixError', error: string): void
}>()

const showDialog = defineModel<boolean>('open', { default: false })

const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

function handleConfirm() {
  emits('confirm')
  showDialog.value = false
}

function handleClose() {
  emits('close')
  showDialog.value = false
}

function canFixError(err: string) {
  const e = err.toLowerCase()
  return e.includes('preview') || e.includes('thumbnail') || e.includes('icon') || e.includes('expression')
}

function handleFix(err: string) {
  emits('fixError', err)
}
</script>

<template>
  <!-- Desktop Dialog -->
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-xl w-[92dvw] transform overflow-y-scroll rounded-2xl bg-white/90 dark:bg-neutral-900/90 p-6 shadow-xl outline-none backdrop-blur-2xl border border-black/5 dark:border-white/5 scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow">
        <div class="mb-4 flex items-center justify-between gap-2">
          <DialogTitle class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            {{ t('settings.live2d-report.title') }}
          </DialogTitle>
          <Button size="sm" variant="secondary" @click="handleClose">
            {{ t('settings.common.close') }}
          </Button>
        </div>

        <div v-if="report" class="flex flex-col gap-4">
          <!-- Report Header -->
          <div
            :class="[
              'flex items-center gap-3 rounded-lg p-4 font-bold',
              report.status === 'VALID' ? 'bg-green-100/50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : '',
              report.status === 'WARNING' ? 'bg-yellow-100/50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : '',
              report.status === 'INVALID' ? 'bg-red-100/50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : '',
            ]"
          >
            <div v-if="report.status === 'VALID'" i-solar:check-circle-bold-duotone text-2xl />
            <div v-else-if="report.status === 'WARNING'" i-solar:danger-bold-duotone text-2xl />
            <div v-else i-solar:close-circle-bold-duotone text-2xl />
            <div flex flex-col>
              <span>Status: {{ report.status }}</span>
              <span text-xs opacity-80>{{ report.fileName }}</span>
            </div>
          </div>

          <!-- Body -->
          <div class="max-h-96 overflow-y-auto pr-2 text-sm space-y-4">
            <div class="grid grid-cols-2 gap-2 rounded bg-neutral-100/50 p-2 dark:bg-neutral-800/50">
              <div>{{ t('settings.live2d-report.structure') }}: <span font-mono>{{ report.structureType }}</span></div>
              <div>{{ t('settings.live2d-report.file-count') }}: <span font-mono>{{ report.totalFiles }}</span></div>
              <div v-if="report.mocInfo" class="col-span-2 border-t border-neutral-200 pt-1 dark:border-neutral-700">
                MOC3: <span font-mono>v{{ report.mocInfo.ver }}</span> ({{ (report.mocInfo.size / 1024 / 1024).toFixed(2) }} MB)
              </div>
            </div>

            <div v-if="report.errors.length > 0" class="space-y-1">
              <div class="flex items-center gap-1 text-red-600 font-bold dark:text-red-400">
                <div i-solar:bug-bold-duotone /> {{ t('settings.live2d-report.critical-issues') }}
              </div>
              <ul class="list-none pl-0 space-y-1">
                <li v-for="(err, i) in report.errors" :key="i" class="flex items-center justify-between gap-2 rounded bg-red-50/50 p-2 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <span>{{ err }}</span>
                  <Button v-if="canFixError(err)" size="sm" variant="secondary-muted" class="h-6 px-2 text-[10px] tracking-wider uppercase" @click="handleFix(err)">
                    {{ t('settings.live2d-report.quick-fix') }}
                  </Button>
                </li>
              </ul>
            </div>

            <div v-if="report.warnings.length > 0" class="space-y-1">
              <div class="flex items-center gap-1 text-yellow-600 font-bold dark:text-yellow-400">
                <div i-solar:danger-bold-duotone /> {{ t('settings.live2d-report.warnings') }}
              </div>
              <ul class="list-none pl-0 space-y-1">
                <li v-for="(w, i) in report.warnings" :key="i" class="rounded bg-yellow-50/50 p-2 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
                  {{ w }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Footer -->
          <div class="mt-2 flex justify-end gap-2">
            <Button variant="secondary" @click="handleClose">
              {{ t('settings.live2d-report.cancel') }}
            </Button>
            <Button v-if="report.status !== 'INVALID'" @click="handleConfirm">
              {{ report.status === 'WARNING' ? t('settings.live2d-report.import-anyway') : t('settings.live2d-report.confirm-import') }}
            </Button>
            <div v-else class="flex items-center gap-1 text-xs text-red-500 italic">
              <div i-solar:danger-triangle-bold /> {{ t('settings.live2d-report.invalid-model') }}
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <!-- Mobile Drawer -->
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DrawerContent
        class="fixed bottom-0 left-0 right-0 z-[9999] mt-20 h-full max-h-[85%] flex flex-col rounded-t-2xl bg-neutral-50 px-4 pt-4 outline-none backdrop-blur-md dark:bg-neutral-900/95"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle />
        <div class="mb-4 flex items-center justify-between gap-2">
          <div class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            {{ t('settings.live2d-report.model-audit') }}
          </div>
          <Button size="sm" variant="secondary" @click="handleClose">
            {{ t('settings.common.close') }}
          </Button>
        </div>

        <div v-if="report" class="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
          <div
            :class="[
              'flex items-center gap-3 rounded-lg p-4 font-bold',
              report.status === 'VALID' ? 'bg-green-100/50 text-green-700 dark:bg-green-900/30' : '',
              report.status === 'WARNING' ? 'bg-yellow-100/50 text-yellow-700 dark:bg-yellow-900/30' : '',
              report.status === 'INVALID' ? 'bg-red-100/50 text-red-700 dark:bg-red-900/30' : '',
            ]"
          >
            <div v-if="report.status === 'VALID'" i-solar:check-circle-bold-duotone text-2xl />
            <div v-else-if="report.status === 'WARNING'" i-solar:danger-bold-duotone text-2xl />
            <div v-else i-solar:close-circle-bold-duotone text-2xl />
            <span>{{ report.status }}: {{ report.fileName.slice(0, 20) }}{{ report.fileName.length > 20 ? '...' : '' }}</span>
          </div>

          <div class="text-sm space-y-4">
            <div v-if="report.errors.length > 0" class="space-y-1">
              <ul class="list-none pl-0 space-y-1">
                <li v-for="(err, i) in report.errors" :key="i" class="flex items-center justify-between gap-2 rounded bg-red-50/50 p-2 text-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <span>{{ err }}</span>
                  <Button v-if="canFixError(err)" size="sm" variant="secondary-muted" class="h-6 px-2 text-[10px] tracking-wider uppercase" @click="handleFix(err)">
                    {{ t('settings.live2d-report.fix') }}
                  </Button>
                </li>
              </ul>
            </div>
            <div v-if="report.warnings.length > 0" class="space-y-1">
              <ul class="list-none pl-0 space-y-1">
                <li v-for="(w, i) in report.warnings" :key="i" class="rounded bg-yellow-50/50 p-2 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
                  {{ w }}
                </li>
              </ul>
            </div>
          </div>

          <div class="mt-auto flex flex-col gap-2 pt-4">
            <Button v-if="report.status !== 'INVALID'" @click="handleConfirm">
              {{ report.status === 'WARNING' ? t('settings.live2d-report.import-anyway') : t('settings.live2d-report.confirm-import') }}
            </Button>
            <Button variant="secondary" @click="handleClose">
              {{ t('settings.live2d-report.cancel') }}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
