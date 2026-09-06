<script setup lang="ts">
import { FieldInput } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useModsServerChannelStore } from '../../../../stores/mods/api/channel-server'

const { t } = useI18n()
const { websocketUrl } = storeToRefs(useModsServerChannelStore())

const websocketUrlModel = computed({
  get() {
    return websocketUrl.value
  },
  set(value: string | undefined) {
    if (value === undefined)
      return

    websocketUrl.value = value
  },
})
</script>

<template>
  <div class="flex flex-col gap-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] backdrop-blur-2xl p-5 transition-all duration-300 hover:shadow-md hover:shadow-black/[0.03] dark:hover:shadow-black/[0.1]">
    <!-- // NOTICE: Currently single WebSocket server only. Future: support array for multiple servers.
      // NOTICE: iOS-only field desync on page entry: persisted websocketUrl stays correct but input
      // renders default value. Keep local until FieldInput/Input mount-time model sync is understood. -->
    <FieldInput
      v-model="websocketUrlModel"
      :label="t('settings.pages.connection.websocket-url.label')"
      :description="t('settings.pages.connection.websocket-url.description')"
      :placeholder="t('settings.pages.connection.websocket-url.placeholder')"
    />
    <slot name="platform-specific" />
  </div>
</template>
