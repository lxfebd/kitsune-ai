<script setup lang="ts">
import { IconItem } from '@kitsune/stage-ui/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { settingsGroups } from '../../../settings-nav'

const props = defineProps<{
  groupId: string
}>()

const { t } = useI18n()

const group = computed(() => settingsGroups.find(g => g.id === props.groupId))

function cardDescriptionKey(memberId: string): string {
  return `settings.groups.cards.${memberId}.description`
}
</script>

<template>
  <div v-if="group" flex="~ col gap-4" font-normal>
    <div flex="~ col gap-4">
      <IconItem
        v-for="(member, index) in group.members"
        :key="member.id"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :style="{
          transitionDelay: `${index * 50}ms`,
        }"
        :title="t(member.labelKey)"
        :description="t(cardDescriptionKey(member.id))"
        :icon="member.icon"
        :to="member.to"
      />
    </div>
  </div>
  <div v-else class="text-center text-sm text-neutral-400">
    {{ t('settings.groups.not-found') }}
  </div>
</template>