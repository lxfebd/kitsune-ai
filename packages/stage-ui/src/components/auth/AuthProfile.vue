<script setup lang="ts">
import { computed } from 'vue'

interface User {
  name: string
  email: string
  avatar?: string
  plan?: string
}

const props = withDefaults(defineProps<{
  user: User
  loading?: boolean
}>(), {
  loading: false,
})

const emit = defineEmits<{
  editProfile: []
  logout: []
}>()

const initials = computed(() => {
  if (!props.user.name) return '?'
  return props.user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Profile Card -->
    <div class="flex items-center gap-4 p-4 bg-white dark:bg-neutral-900 rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
      <!-- Avatar -->
      <div class="relative">
        <div
          v-if="!user.avatar"
          class="w-12 h-12 rounded-full bg-primary-500/10 flex items-center justify-center"
        >
          <span class="text-lg font-medium text-primary-600 dark:text-primary-400">
            {{ initials }}
          </span>
        </div>
        <img
          v-else
          :src="user.avatar"
          :alt="user.name"
          class="w-12 h-12 rounded-full object-cover"
        >
        <div
          v-if="user.plan"
          class="absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-primary-500 text-white capitalize"
        >
          {{ user.plan }}
        </div>
      </div>
      
      <!-- Info -->
      <div class="flex-1 min-w-0">
        <h3 class="text-base font-medium text-neutral-900 dark:text-neutral-100 m-0 truncate">
          {{ user.name || 'User' }}
        </h3>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 m-0 truncate">
          {{ user.email }}
        </p>
      </div>
    </div>
    
    <!-- Actions -->
    <div class="flex flex-col gap-2">
      <button
        :class="[
          'flex items-center gap-3 px-4 py-3 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.06] dark:border-white/[0.06]',
          'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
          'transition-all duration-200',
          'text-left',
        ]"
        @click="emit('editProfile')"
      >
        <div class="i-solar:user-bold w-4 h-4 text-neutral-500" />
        <span class="text-neutral-700 dark:text-neutral-300">
          Edit Profile
        </span>
        <div class="i-solar:alt-arrow-right-bold ml-auto w-4 h-4 text-neutral-400" />
      </button>
      
      <button
        :class="[
          'flex items-center gap-3 px-4 py-3 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.06] dark:border-white/[0.06]',
          'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
          'transition-all duration-200',
          'text-left',
        ]"
      >
        <div class="i-solar:cloud-bold w-4 h-4 text-neutral-500" />
        <span class="text-neutral-700 dark:text-neutral-300">
          Sync Settings
        </span>
        <div class="i-solar:alt-arrow-right-bold ml-auto w-4 h-4 text-neutral-400" />
      </button>
      
      <button
        :class="[
          'flex items-center gap-3 px-4 py-3 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.06] dark:border-white/[0.06]',
          'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
          'transition-all duration-200',
          'text-left',
        ]"
      >
        <div class="i-solar:wallet-bold w-4 h-4 text-neutral-500" />
        <span class="text-neutral-700 dark:text-neutral-300">
          Flux Balance
        </span>
        <div class="i-solar:alt-arrow-right-bold ml-auto w-4 h-4 text-neutral-400" />
      </button>
    </div>
    
    <!-- Logout -->
    <button
      :disabled="loading"
      :class="[
        'w-full px-4 py-2.5 rounded-lg text-sm font-medium',
        'bg-red-500/10 text-red-600 dark:text-red-400',
        'hover:bg-red-500/20',
        'transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      ]"
      @click="emit('logout')"
    >
      <span v-if="loading" class="flex items-center justify-center gap-2">
        <div class="i-solar:refresh-bold animate-spin w-4 h-4" />
        Signing out...
      </span>
      <span v-else>Sign Out</span>
    </button>
  </div>
</template>
