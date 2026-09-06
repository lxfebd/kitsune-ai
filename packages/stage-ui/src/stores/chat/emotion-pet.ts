import type { EmotionPayload } from '../../constants/emotions'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 桌宠情绪事件队列 store — 跨组件可访问的 emotionsQueue。
 *
 * Stage.vue 从此 store 读取待播放的情绪，其他组件（如 executor 事件桥接器）
 * 通过 enqueue 推入情绪。替代 Stage.vue 内部的局部队列，使主进程事件能驱动桌宠表情。
 */
export const usePetEmotionStore = defineStore('pet-emotion', () => {
  const queue = ref<EmotionPayload[]>([])

  function enqueue(emotion: EmotionPayload): void {
    queue.value.push(emotion)
  }

  function dequeue(): EmotionPayload | undefined {
    return queue.value.shift()
  }

  function peek(): EmotionPayload | undefined {
    return queue.value[0]
  }

  function clear(): void {
    queue.value = []
  }

  return { queue, enqueue, dequeue, peek, clear }
})