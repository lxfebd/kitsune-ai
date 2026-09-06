import { ref } from 'vue'

const routerStatusMessage = ref('')
const routerStatusVisible = ref(false)
let hideTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Show a routing status message in the status bar.
 *
 * @param message - The message to display (e.g. "本地模型不可用，已切换至 OpenAI").
 * @param durationMs - How long to show the message. Defaults to 5000ms.
 */
export function showRouterStatus(message: string, durationMs = 5000) {
  if (hideTimeout)
    clearTimeout(hideTimeout)

  routerStatusMessage.value = message
  routerStatusVisible.value = true

  hideTimeout = setTimeout(() => {
    routerStatusVisible.value = false
    hideTimeout = null
  }, durationMs)
}

/**
 * Composable for consuming router status in Vue templates.
 */
export function useRouterStatus() {
  return {
    routerStatusMessage,
    routerStatusVisible,
  }
}
