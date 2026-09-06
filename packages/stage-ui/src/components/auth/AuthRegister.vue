<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  loading?: boolean
  error?: string
}>(), {
  loading: false,
})

const emit = defineEmits<{
  submit: [data: { name: string; email: string; password: string }]
  login: []
}>()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const passwordMismatch = computed(() => {
  return password.value.length > 0 && confirmPassword.value.length > 0 && password.value !== confirmPassword.value
})

const isValid = computed(() => {
  return (
    name.value.length > 0
    && email.value.includes('@')
    && password.value.length >= 6
    && password.value === confirmPassword.value
  )
})

function handleSubmit() {
  if (!isValid.value || props.loading) return
  
  emit('submit', {
    name: name.value,
    email: email.value,
    password: password.value,
  })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Error Message -->
    <div
      v-if="error"
      :class="[
        'flex items-center gap-2 p-3 rounded-lg',
        'bg-red-500/10 border border-red-500/20',
      ]"
    >
      <div class="i-solar:danger-circle-bold w-4 h-4 text-red-500 shrink-0" />
      <p class="text-sm text-red-600 dark:text-red-400 m-0">
        {{ error }}
      </p>
    </div>
    
    <!-- Name Field -->
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Name
      </label>
      <input
        v-model="name"
        type="text"
        placeholder="Your name"
        :disabled="loading"
        :class="[
          'px-3 py-2 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
          'outline-none transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ]"
        @keydown.enter="handleSubmit"
      >
    </div>
    
    <!-- Email Field -->
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Email
      </label>
      <input
        v-model="email"
        type="email"
        placeholder="your@email.com"
        :disabled="loading"
        :class="[
          'px-3 py-2 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
          'outline-none transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ]"
        @keydown.enter="handleSubmit"
      >
    </div>
    
    <!-- Password Field -->
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Password
      </label>
      <input
        v-model="password"
        type="password"
        placeholder="••••••••"
        :disabled="loading"
        :class="[
          'px-3 py-2 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
          'outline-none transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ]"
        @keydown.enter="handleSubmit"
      >
    </div>
    
    <!-- Confirm Password Field -->
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        Confirm Password
      </label>
      <input
        v-model="confirmPassword"
        type="password"
        placeholder="••••••••"
        :disabled="loading"
        :class="[
          'px-3 py-2 rounded-lg text-sm',
          'bg-white dark:bg-neutral-900',
          'border border-black/[0.1] dark:border-white/[0.1]',
          'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
          'outline-none transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ]"
        @keydown.enter="handleSubmit"
      >
      <p
        v-if="passwordMismatch"
        class="text-xs text-red-500 m-0"
      >
        Passwords do not match
      </p>
    </div>
    
    <!-- Submit Button -->
    <button
      :disabled="!isValid || loading"
      :class="[
        'px-4 py-2.5 rounded-lg text-sm font-medium',
        'transition-all duration-200',
        isValid && !loading
          ? 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700'
          : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed',
      ]"
      @click="handleSubmit"
    >
      <span v-if="loading" class="flex items-center justify-center gap-2">
        <div class="i-solar:refresh-bold animate-spin w-4 h-4" />
        Creating account...
      </span>
      <span v-else>Create Account</span>
    </button>
    
    <!-- Divider -->
    <div class="flex items-center gap-2">
      <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
      <span class="text-xs text-neutral-400">or</span>
      <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
    </div>
    
    <!-- Login Link -->
    <button
      :class="[
        'px-4 py-2 rounded-lg text-sm font-medium',
        'bg-black/[0.05] dark:bg-white/[0.05]',
        'text-neutral-700 dark:text-neutral-300',
        'hover:bg-black/[0.08] dark:hover:bg-white/[0.08]',
        'transition-all duration-200',
      ]"
      @click="emit('login')"
    >
      Already have an account? Sign In
    </button>
  </div>
</template>
