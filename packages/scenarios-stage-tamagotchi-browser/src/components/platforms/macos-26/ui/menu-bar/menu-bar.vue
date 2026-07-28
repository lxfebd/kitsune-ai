<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { Apple, Switch2_0, Wifi } from '../../icons/sf-symbol-like'

const { t } = useI18n()
</script>

<template>
  <div
    :class="[
      'absolute top-0 left-0',
      'z-1000',
      'w-full py-1 px-5',
      'flex items-center',
      'bg-white/40 dark:bg-black/40',
    ]"
  >
    <div class="w-full flex items-center gap-4">
      <Apple />
      <div :class="['text-xs', 'font-600']">
        <span>AIRI</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.file') }}</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.edit') }}</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.selection') }}</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.view') }}</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.window') }}</span>
      </div>
      <div :class="['text-xs']">
        <span>{{ t('menu-bar.help') }}</span>
      </div>
      <div class="w-full flex-1" />
      <Wifi />
      <Switch2_0 />
      <div :class="['text-xs']">
        <span>Fri Apr 3 22:04:05</span>
      </div>
    </div>
  </div>
</template>
