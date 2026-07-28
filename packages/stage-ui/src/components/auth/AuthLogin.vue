<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  loading?: boolean
  error?: string
  showRemember?: boolean
}>(), {
  loading: false,
  showRemember: true,
})

const emit = defineEmits<{
  submit: [data: { email: string; password: string; remember: boolean }]
  forgotPassword: []
  register: []
}>()

const email = ref('')
const password = ref('')
const remember = ref(false)

const isValid = computed(() => {
  return email.value.includes('@') && password.value.length >= 6
})

function handleSubmit() {
  if (!isValid.value || props.loading) return
  
  emit('submit', {
    email: email.value,
    password: password.value,
    remember: remember.value,
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
      <div class="flex items-center justify-between">
        <label class="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Password
        </label>
        <button
          class="text-xs text-primary-500 hover:text-primary-600 transition-colors bg-transparent border-0 cursor-pointer p-0"
          @click="emit('forgotPassword')"
        >
          Forgot password?
        </button>
      </div>
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
    
    <!-- Remember Me -->
    <label
      v-if="showRemember"
      class="flex items-center gap-2 cursor-pointer"
    >
      <input
        v-model="remember"
        type="checkbox"
        :class="[
          'w-4 h-4 rounded',
          'text-primary-500',
          'border-neutral-300 dark:border-neutral-700',
          'focus:ring-primary-500',
        ]"
      >
      <span class="text-sm text-neutral-600 dark:text-neutral-400">
        Remember me
      </span>
    </label>
    
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
        Signing in...
      </span>
      <span v-else>Sign In</span>
    </button>
    
    <!-- Divider -->
    <div class="flex items-center gap-2">
      <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
      <span class="text-xs text-neutral-400">or</span>
      <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
    </div>
    
    <!-- Register Link -->
    <button
      :class="[
        'px-4 py-2 rounded-lg text-sm font-medium',
        'bg-black/[0.05] dark:bg-white/[0.05]',
        'text-neutral-700 dark:text-neutral-300',
        'hover:bg-black/[0.08] dark:hover:bg-white/[0.08]',
        'transition-all duration-200',
      ]"
      @click="emit('register')"
    >
      Create Account
    </button>
  </div>
</template>
