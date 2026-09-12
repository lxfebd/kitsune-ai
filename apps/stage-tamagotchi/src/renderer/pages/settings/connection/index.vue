<script setup lang="ts">
import { isStageTamagotchi } from '@kitsune/stage-shared'
import { getElectronEventaContext, useElectronEventaInvoke } from '@kitsune/electron-vueuse'
import { ConnectionSettings } from '@kitsune/stage-ui/components'
import { Button, Callout, FieldCheckbox, FieldInput, Input, SelectTab } from '@kitsune/ui'
import { refDebounced, useClipboard } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ServerChannelQrCard from './server-channel-qr-card.vue'

import { electronGetServerChannelPeers } from '../../../../shared/eventa'
import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'
import {
  hostnameFromExposureMode,
  serverChannelExposureModeFromHostname,
} from '../../../stores/settings/server-channel-options'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { authToken, hostname, lastApplyError, tlsConfig } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const websocketTlsEnabled = computed({
  get: () => tlsConfig.value != null,
  set: (value: boolean) => {
    serverChannelSettingsStore.tlsConfig = value ? {} : null
  },
})

const exposureMode = computed({
  get: () => serverChannelExposureModeFromHostname(hostname.value),
  set: (mode) => {
    hostname.value = hostnameFromExposureMode(mode, hostname.value)
  },
})

const showAdvancedHostname = computed(() => exposureMode.value === 'advanced')
const showDesktopServerControls = computed(() => isStageTamagotchi())
const authTokenInput = shallowRef(authToken.value)
const authTokenInputDebounced = refDebounced(authTokenInput, 500)
const authTokenVisible = shallowRef(false)
const { copied: authTokenCopied, copy: copyAuthToken, isSupported: isClipboardSupported } = useClipboard({ source: authTokenInput, legacy: true })
const authTokenInputType = computed(() => authTokenVisible.value ? 'text' : 'password')
const canCopyAuthToken = computed(() => isClipboardSupported.value && authTokenInput.value.length > 0)

const exposureModeOptions = computed(() => [
  {
    label: t('settings.pages.connection.server-hostname.options.this-device'),
    value: 'this-device',
  },
  {
    label: t('settings.pages.connection.server-hostname.options.all'),
    value: 'all',
  },
  {
    label: t('settings.pages.connection.server-hostname.options.advanced'),
    value: 'advanced',
  },
])

watch(authToken, (value) => {
  if (value !== authTokenInput.value)
    authTokenInput.value = value
})

watch(authTokenInputDebounced, (value) => {
  if (value !== authToken.value)
    authToken.value = value
})

// 已连接远程对端：轮询主进程 channel-server 的 peer 列表（Electron 内可用）
const invokeGetPeers = useElectronEventaInvoke(electronGetServerChannelPeers)
const connectedPeers = ref<string[]>([])
const peersSupported = ref(true)
let peersPollTimer: ReturnType<typeof setInterval> | null = null

async function refreshConnectedPeers() {
  if (typeof getElectronEventaContext !== 'function') return
  try {
    const peers = await invokeGetPeers()
    if (peers) {
      connectedPeers.value = peers
      peersSupported.value = true
    }
  }
  catch {
    // IPC 不可用（浏览器 view）→ 保持空，隐藏区块
    peersSupported.value = false
  }
}

refreshConnectedPeers()
peersPollTimer = setInterval(refreshConnectedPeers, 3000)
onScopeDispose(() => {
  if (peersPollTimer)
    clearInterval(peersPollTimer)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <Callout
      v-if="lastApplyError"
      theme="orange"
      :label="t('settings.websocket-secure-enabled.title')"
    >
      {{ lastApplyError }}
    </Callout>
    <ConnectionSettings>
      <template #platform-specific>
        <div
          v-if="peersSupported"
          :class="['flex', 'flex-col', 'gap-2', 'rounded-xl', 'border', 'border-black/[0.06]', 'dark:border-white/[0.06]', 'bg-white/40', 'dark:bg-white/[0.02]', 'px-3', 'py-2.5']"
        >
          <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
            <span :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
              {{ t('settings.pages.connection.connected-remotes.label') }}
            </span>
            <span
              :class="[
                'inline-flex', 'items-center', 'gap-1.5', 'rounded-full', 'px-2', 'py-0.5', 'text-[10px]', 'font-medium', 'uppercase', 'tracking-wide',
                connectedPeers.length
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
              ]"
            >
              <span :class="['h-1.5', 'w-1.5', 'rounded-full', connectedPeers.length ? 'bg-emerald-500' : 'bg-neutral-400']" />
              {{ connectedPeers.length ? t('settings.pages.connection.connected-remotes.connected') : t('settings.pages.connection.connected-remotes.none') }}
            </span>
          </div>
          <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400', 'm-0']">
            {{ t('settings.pages.connection.connected-remotes.description') }}
          </p>
          <div v-if="connectedPeers.length" :class="['flex', 'flex-wrap', 'gap-1.5']">
            <span
              v-for="peerId in connectedPeers"
              :key="peerId"
              :class="['rounded-md', 'bg-black/[0.05]', 'dark:bg-white/[0.05]', 'px-2', 'py-0.5', 'font-mono', 'text-[10px]', 'text-neutral-600', 'dark:text-neutral-300']"
            >
              {{ peerId.slice(0, 8) }}
            </span>
          </div>
        </div>

        <FieldCheckbox
          v-model="websocketTlsEnabled"
          :label="t('settings.websocket-secure-enabled.title')"
          :description="t('settings.websocket-secure-enabled.description')"
        />

        <div
          v-if="showDesktopServerControls"
          :class="['flex', 'flex-col', 'gap-2']"
        >
          <div :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
            {{ t('settings.pages.connection.server-hostname.label') }}
          </div>
          <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.connection.server-hostname.description') }}
          </div>
          <SelectTab
            v-model="exposureMode"
            size="sm"
            :options="exposureModeOptions"
          />
        </div>

        <FieldInput
          v-if="showDesktopServerControls && showAdvancedHostname"
          v-model="hostname"
          :label="t('settings.pages.connection.server-hostname.advanced-label')"
          :description="t('settings.pages.connection.server-hostname.advanced-description')"
          placeholder="192.168.1.25"
        />

        <div
          v-if="showDesktopServerControls"
          :class="['max-w-full']"
        >
          <label :class="['flex', 'flex-col', 'gap-4']">
            <div>
              <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
                {{ t('settings.pages.connection.server-auth-token.label') }}
              </div>
              <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']" text-wrap>
                {{ t('settings.pages.connection.server-auth-token.description') }}
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <Input
                v-model="authTokenInput"
                :type="authTokenInputType"
                :placeholder="t('settings.pages.connection.server-auth-token.placeholder')"
              />
              <Button
                type="button"
                variant="secondary-muted"
                size="sm"
                shape="square"
                :icon="authTokenVisible ? 'i-solar:eye-closed-bold-duotone' : 'i-solar:eye-bold-duotone'"
                :aria-label="authTokenVisible ? '隐藏认证令牌' : '显示认证令牌'"
                :title="authTokenVisible ? '隐藏认证令牌' : '显示认证令牌'"
                data-testid="server-auth-token-visibility-toggle"
                @click="authTokenVisible = !authTokenVisible"
              />
              <Button
                type="button"
                variant="secondary-muted"
                size="sm"
                shape="square"
                :icon="authTokenCopied ? 'i-solar:check-circle-bold-duotone' : 'i-solar:copy-line-duotone'"
                :disabled="!canCopyAuthToken"
                :aria-label="authTokenCopied ? '已复制认证令牌' : '复制认证令牌'"
                :title="authTokenCopied ? '已复制认证令牌' : '复制认证令牌'"
                data-testid="server-auth-token-copy"
                @click="copyAuthToken()"
              />
            </div>
          </label>
        </div>

        <ServerChannelQrCard />
      </template>
    </ConnectionSettings>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.connection.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.connection.description
  icon: i-solar:wi-fi-router-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
</route>
