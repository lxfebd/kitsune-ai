<script setup lang="ts">
import type { ProfileSwitcherPopoverProps } from '@kitsune/stage-ui/components'
import type { PropType } from 'vue'

import { useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { ProfileSwitcherPopover } from '@kitsune/stage-ui/components'

import { electronOpenSettings } from '../../../../shared/eventa'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  placement: String as PropType<ProfileSwitcherPopoverProps['placement']>,
})

const open = defineModel<boolean>('open', { default: false })

const openSettings = useElectronEventaInvoke(electronOpenSettings)

function handleManage() {
  openSettings({ route: '/settings/kitsune-card' })
}
</script>

<template>
  <ProfileSwitcherPopover v-model:open="open" :placement="props.placement" @manage="handleManage">
    <template #default="{ open: popoverOpen, toggle, activeCard }">
      <slot :open="popoverOpen" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
