<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'

const { t } = useI18n()

// Mock account state - replace with actual store
const isLoggedIn = ref(false)
const user = ref({
  name: '',
  email: '',
  avatar: '',
  plan: 'free',
})

const isLoading = ref(false)

// Login form
const loginForm = ref({
  email: '',
  password: '',
})

const isLoginValid = computed(() => {
  return loginForm.value.email.includes('@') && loginForm.value.password.length >= 6
})

async function handleLogin() {
  if (!isLoginValid.value) return
  
  isLoading.value = true
  try {
    // TODO: Implement actual login logic with server-sdk
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    isLoggedIn.value = true
    user.value = {
      name: 'User',
      email: loginForm.value.email,
      avatar: '',
      plan: 'free',
    }
  } catch (error) {
    console.error('Login failed:', error)
  } finally {
    isLoading.value = false
  }
}

async function handleLogout() {
  isLoggedIn.value = false
  user.value = {
    name: '',
    email: '',
    avatar: '',
    plan: 'free',
  }
  loginForm.value = { email: '', password: '' }
}

// Registration form
const showRegister = ref(false)
const registerForm = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const isRegisterValid = computed(() => {
  return (
    registerForm.value.name.length > 0
    && registerForm.value.email.includes('@')
    && registerForm.value.password.length >= 6
    && registerForm.value.password === registerForm.value.confirmPassword
  )
})

async function handleRegister() {
  if (!isRegisterValid.value) return
  
  isLoading.value = true
  try {
    // TODO: Implement actual registration logic
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    isLoggedIn.value = true
    user.value = {
      name: registerForm.value.name,
      email: registerForm.value.email,
      avatar: '',
      plan: 'free',
    }
    showRegister.value = false
  } catch (error) {
    console.error('Registration failed:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="settings-panel bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
      <div class="flex items-center gap-3">
        <div class="i-solar:user-bold-duotone w-5 h-5 text-primary-500" />
        <h2 class="text-base font-medium m-0 text-neutral-900 dark:text-neutral-100">
          {{ t('settings.pages.account.title', 'Account') }}
        </h2>
      </div>
      <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
        {{ t('settings.pages.account.description', 'Manage your account settings and sync preferences') }}
      </p>
    </div>

    <!-- Not Logged In State -->
    <div v-if="!isLoggedIn" class="settings-panel bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
      <!-- Login Form -->
      <div v-if="!showRegister">
        <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-4">
          {{ t('settings.pages.account.login.title', 'Sign In') }}
        </h3>
        
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.login.email', 'Email') }}
            </label>
            <input
              v-model="loginForm.email"
              type="email"
              :placeholder="t('settings.pages.account.login.emailPlaceholder', 'your@email.com')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.login.password', 'Password') }}
            </label>
            <input
              v-model="loginForm.password"
              type="password"
              :placeholder="t('settings.pages.account.login.passwordPlaceholder', '••••••••')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <button
            :disabled="!isLoginValid || isLoading"
            :class="[
              'mt-2 px-4 py-2 rounded-lg text-sm font-medium',
              'transition-all duration-200',
              isLoginValid && !isLoading
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed',
            ]"
            @click="handleLogin"
          >
            <span v-if="isLoading" class="flex items-center justify-center gap-2">
              <div class="i-solar:refresh-bold animate-spin w-4 h-4" />
              {{ t('settings.pages.account.login.signingIn', 'Signing in...') }}
            </span>
            <span v-else>
              {{ t('settings.pages.account.login.signIn', 'Sign In') }}
            </span>
          </button>
          
          <div class="flex items-center gap-2 mt-2">
            <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
            <span class="text-xs text-neutral-400">{{ t('settings.pages.account.login.or', 'or') }}</span>
            <div class="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
          </div>
          
          <button
            :class="[
              'px-4 py-2 rounded-lg text-sm font-medium',
              'bg-black/[0.05] dark:bg-white/[0.05]',
              'text-neutral-700 dark:text-neutral-300',
              'hover:bg-black/[0.08] dark:hover:bg-white/[0.08]',
              'transition-all duration-200',
            ]"
            @click="showRegister = true"
          >
            {{ t('settings.pages.account.login.createAccount', 'Create Account') }}
          </button>
        </div>
      </div>
      
      <!-- Register Form -->
      <div v-else>
        <h3 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-4">
          {{ t('settings.pages.account.register.title', 'Create Account') }}
        </h3>
        
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.register.name', 'Name') }}
            </label>
            <input
              v-model="registerForm.name"
              type="text"
              :placeholder="t('settings.pages.account.register.namePlaceholder', 'Your name')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.register.email', 'Email') }}
            </label>
            <input
              v-model="registerForm.email"
              type="email"
              :placeholder="t('settings.pages.account.register.emailPlaceholder', 'your@email.com')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.register.password', 'Password') }}
            </label>
            <input
              v-model="registerForm.password"
              type="password"
              :placeholder="t('settings.pages.account.register.passwordPlaceholder', '••••••••')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('settings.pages.account.register.confirmPassword', 'Confirm Password') }}
            </label>
            <input
              v-model="registerForm.confirmPassword"
              type="password"
              :placeholder="t('settings.pages.account.register.confirmPasswordPlaceholder', '••••••••')"
              :class="[
                'px-3 py-2 rounded-lg text-sm',
                'bg-white dark:bg-neutral-900',
                'border border-black/[0.1] dark:border-white/[0.1]',
                'focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
                'outline-none transition-all',
              ]"
            >
          </div>
          
          <div class="flex gap-2 mt-2">
            <button
              :class="[
                'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                'bg-black/[0.05] dark:bg-white/[0.05]',
                'text-neutral-700 dark:text-neutral-300',
                'hover:bg-black/[0.08] dark:hover:bg-white/[0.08]',
                'transition-all duration-200',
              ]"
              @click="showRegister = false"
            >
              {{ t('settings.pages.account.register.back', 'Back') }}
            </button>
            <button
              :disabled="!isRegisterValid || isLoading"
              :class="[
                'flex-1 px-4 py-2 rounded-lg text-sm font-medium',
                'transition-all duration-200',
                isRegisterValid && !isLoading
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed',
              ]"
              @click="handleRegister"
            >
              <span v-if="isLoading" class="flex items-center justify-center gap-2">
                <div class="i-solar:refresh-bold animate-spin w-4 h-4" />
                {{ t('settings.pages.account.register.creating', 'Creating...') }}
              </span>
              <span v-else>
                {{ t('settings.pages.account.register.create', 'Create Account') }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Logged In State -->
    <div v-else class="settings-panel bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
      <!-- User Profile Card -->
      <div class="flex items-center gap-4 p-4 bg-white dark:bg-neutral-900 rounded-lg border border-black/[0.06] dark:border-white/[0.06]">
        <div class="w-12 h-12 rounded-full bg-primary-500/10 flex items-center justify-center">
          <div v-if="!user.avatar" class="i-solar:user-bold w-6 h-6 text-primary-500" />
          <img v-else :src="user.avatar" :alt="user.name" class="w-full h-full rounded-full object-cover">
        </div>
        <div class="flex-1">
          <h3 class="text-base font-medium text-neutral-900 dark:text-neutral-100 m-0">
            {{ user.name || 'User' }}
          </h3>
          <p class="text-sm text-neutral-500 dark:text-neutral-400 m-0">
            {{ user.email }}
          </p>
          <div class="flex items-center gap-2 mt-1">
            <span class="px-2 py-0.5 text-xs rounded-full bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium capitalize">
              {{ user.plan }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Account Actions -->
      <div class="flex flex-col gap-2 mt-4">
        <button
          :class="[
            'flex items-center gap-3 px-4 py-3 rounded-lg text-sm',
            'bg-white dark:bg-neutral-900',
            'border border-black/[0.06] dark:border-white/[0.06]',
            'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]',
            'transition-all duration-200',
          ]"
        >
          <div class="i-solar:settings-bold w-4 h-4 text-neutral-500" />
          <span class="text-neutral-700 dark:text-neutral-300">
            {{ t('settings.pages.account.actions.profile', 'Edit Profile') }}
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
          ]"
        >
          <div class="i-solar:cloud-bold w-4 h-4 text-neutral-500" />
          <span class="text-neutral-700 dark:text-neutral-300">
            {{ t('settings.pages.account.actions.sync', 'Sync Settings') }}
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
          ]"
        >
          <div class="i-solar:wallet-bold w-4 h-4 text-neutral-500" />
          <span class="text-neutral-700 dark:text-neutral-300">
            {{ t('settings.pages.account.actions.flux', 'Flux Balance') }}
          </span>
          <div class="i-solar:alt-arrow-right-bold ml-auto w-4 h-4 text-neutral-400" />
        </button>
      </div>
      
      <!-- Logout -->
      <button
        :class="[
          'mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium',
          'bg-red-500/10 text-red-600 dark:text-red-400',
          'hover:bg-red-500/20',
          'transition-all duration-200',
        ]"
        @click="handleLogout"
      >
        {{ t('settings.pages.account.actions.logout', 'Sign Out') }}
      </button>
    </div>

    <!-- Info Card -->
    <div class="settings-panel bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
      <div class="flex items-start gap-3">
        <div class="i-solar:info-circle-bold w-5 h-5 text-blue-500 mt-0.5" />
        <div>
          <h4 class="text-sm font-medium text-neutral-900 dark:text-neutral-100 m-0">
            {{ t('settings.pages.account.info.title', 'About Accounts') }}
          </h4>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1 m-0 leading-relaxed">
            {{ t('settings.pages.account.info.description', 'Your account allows you to sync settings across devices, access Flux credits for AI services, and manage your character library.') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.account.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
