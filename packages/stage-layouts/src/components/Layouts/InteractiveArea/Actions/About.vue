<script setup lang="ts">
import { isStageCapacitor, isStageTamagotchi } from '@kitsune/stage-shared'
import { AboutContent, AboutDialog } from '@kitsune/stage-ui/components'
import { useBuildInfo } from '@kitsune/stage-ui/composables'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const show = ref(false)
const buildInfo = useBuildInfo()

const aboutLinks = [
  // TODO(audit): 待 Kitsune 正式域名确定后更新（与 libs/server.ts 的 api.kitsune.ai 兜底同属用户域名决策）
  { label: 'Home', href: 'https://kitsune.ai', icon: 'i-solar:home-smile-outline' },
  // TODO(audit): 同上，域名随正式站点确认
  { label: 'Documentations', href: 'https://kitsune.ai/docs', icon: 'i-solar:document-add-outline' },
  { label: 'GitHub', href: 'https://github.com/lxfebd/kitsune-ai', icon: 'i-simple-icons:github' },
]

const edition = isStageTamagotchi()
  ? t('base.edition.desktop')
  : isStageCapacitor()
    ? t('base.edition.mobile')
    : t('base.edition.web')
</script>

<template>
  <button
    title="About"
    :class="[
      'w-fit p-2',
      'flex justify-center md:items-center self-end',
      'border-2 border-solid border-neutral-100/60 dark:border-neutral-800/30',
      'bg-neutral-50/70 dark:bg-neutral-800/70',
      'backdrop-blur-md',
      'rounded-xl',
    ]"
    @click="show = !show"
  >
    <div i-solar:info-circle-outline class="size-5" text="neutral-500 dark:neutral-400" />
  </button>
  <AboutDialog v-model="show">
    <AboutContent :subtitle="edition" :build-info="buildInfo" :links="aboutLinks" />
  </AboutDialog>
</template>

