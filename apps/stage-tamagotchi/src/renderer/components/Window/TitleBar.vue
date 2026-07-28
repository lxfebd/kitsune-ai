<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  title: string
  icon: string
  /** Window IPC channel prefix, e.g. 'chat-window' -> sends chat-window-close/minimize/maximize */
  windowChannel?: string
}>(), {
  windowChannel: 'chat-window',
})

const { t } = useI18n()

function send(suffix: string) {
  if (typeof window !== 'undefined' && window.electron?.ipcRenderer)
    window.electron.ipcRenderer.send(`${props.windowChannel}-${suffix}`)
}
</script>

<template>
  <div
    class="fixed top-0 left-0 right-0 z-100 w-100dvw select-none bg-white/50 dark:bg-neutral-900/50 backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.06] pl-[78px] pr-3 py-2.5"
    style="-webkit-app-region: drag"
  >
    <div class="flex items-center" style="-webkit-app-region: drag">
      <!-- Traffic lights -->
      <div class="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2" style="-webkit-app-region: no-drag">
        <button
          class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#FF5F57] transition-all hover:bg-[#FF4040]"
          style="-webkit-app-region: no-drag"
          :title="t('tamagotchi.stage.title-bar.close')"
          @click.stop="send('close')"
        >
          <div class="i-solar:close-bold text-[8px] text-[#4A0002]/0 group-hover:text-[#4A0002]/80 transition-colors" />
        </button>
        <button
          class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#FEBC2E] transition-all hover:bg-[#FFA600]"
          style="-webkit-app-region: no-drag"
          :title="t('tamagotchi.stage.title-bar.minimize')"
          @click.stop="send('minimize')"
        >
          <div class="i-solar:minus-line text-[8px] text-[#5A3B00]/0 group-hover:text-[#5A3B00]/80 transition-colors" />
        </button>
        <button
          class="group flex h-3 w-3 items-center justify-center rounded-full bg-[#28C840] transition-all hover:bg-[#1AAB29]"
          style="-webkit-app-region: no-drag"
          :title="t('tamagotchi.stage.title-bar.maximize')"
          @click.stop="send('maximize')"
        >
          <div class="i-solar:add-line text-[8px] text-[#0A4A00]/0 group-hover:text-[#0A4A00]/80 transition-colors" />
        </button>
      </div>

      <!-- Title -->
      <div class="flex items-center gap-2 px-2 py-1 rounded-lg cursor-default select-none" style="-webkit-app-region: no-drag">
        <div :class="[icon, 'text-neutral-400 dark:text-neutral-500 select-none whitespace-nowrap']" />
        <span class="select-none whitespace-nowrap text-[13px] font-medium text-neutral-600/80 dark:text-neutral-400/80">
          {{ title }}
        </span>
      </div>

      <div class="flex-1" style="-webkit-app-region: drag" />
    </div>
  </div>
</template>
