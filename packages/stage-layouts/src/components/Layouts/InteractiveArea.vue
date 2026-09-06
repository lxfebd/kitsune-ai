<script setup lang="ts">
import type { ChatHistoryItem } from '@kitsune/stage-ui/types/chat'

import { ChatHistory } from '@kitsune/stage-ui/components'
import { useAnalytics, useRouterStatus } from '@kitsune/stage-ui/composables'
import { useChatOrchestratorStore } from '@kitsune/stage-ui/stores/chat'
import { useChatSessionStore } from '@kitsune/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@kitsune/stage-ui/stores/chat/stream-store'
import { useDeferredMount } from '@kitsune/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import ChatActionButtons from '../Widgets/ChatActionButtons.vue'
import ChatArea from '../Widgets/ChatArea.vue'
import ChatContainer from '../Widgets/ChatContainer.vue'

const { isReady } = useDeferredMount()
const { sending } = storeToRefs(useChatOrchestratorStore())
const { routerStatusMessage, routerStatusVisible } = useRouterStatus()
const { messages } = storeToRefs(useChatSessionStore())
const { streamingMessage } = storeToRefs(useChatStreamStore())

const isLoading = ref(true)
const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])
const { trackChatMessageDeleted } = useAnalytics()

function handleDeleteMessage(index: number) {
  const message = messages.value[index]
  messages.value = messages.value.filter((_, messageIndex) => messageIndex !== index)
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
}
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <ChatContainer>
        <div
          v-if="isLoading"
          absolute left-0 top-0 h-1 w-full overflow-hidden rounded-t-xl
          class="bg-primary-500/20"
        >
          <div h-full w="1/3" origin-left bg-primary-500 class="animate-scan" />
        </div>
        <div w="full" max-h="<md:[60%]" py="<sm:2" flex="~ col" rounded="lg" relative h-full flex-1 overflow-hidden px="2 <md:0" py-4>
          <ChatHistory
            v-if="isReady"
            :messages="historyMessages"
            :sending="sending"
            :streaming-message="streamingMessage"
            h-full
            variant="desktop"
            @delete-message="handleDeleteMessage($event.index)"
            @vue:mounted="isLoading = false"
          />
        </div>
        <ChatArea />
        <Transition name="fade">
          <div
            v-if="routerStatusVisible"
            class="router-status-bar"
          >
            {{ routerStatusMessage }}
          </div>
        </Transition>
      </ChatContainer>
    </div>

    <ChatActionButtons />
  </div>
</template>

<style scoped>
@keyframes scan {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.animate-scan {
  animation: scan 2s infinite linear;
}

.router-status-bar {
  padding: 4px 12px;
  font-size: 11px;
  color: #888;
  text-align: center;
  background: rgba(99, 102, 241, 0.08);
  border-top: 1px solid rgba(99, 102, 241, 0.15);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
