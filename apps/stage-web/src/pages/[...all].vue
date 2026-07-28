<script setup lang="ts">
import { Button } from '@kitsune/ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div h-full w-full flex flex-col items-center justify-center gap-4>
    <div text-3xl>
      {{ t('stage.errors.404.title') }}
    </div>
    <div>
      <Button @click="router.go(-1)">
        {{ t('stage.errors.404.go-back') }}
      </Button>
    </div>
  </div>
</template>
