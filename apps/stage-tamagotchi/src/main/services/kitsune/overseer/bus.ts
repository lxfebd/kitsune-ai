/**
 * 极简发布订阅总线 — Supervisor 与 TaskPusher 之间的事件通道。
 *
 * 从 index.ts 析出。订阅处理器抛错不影响其它订阅者。
 */
export function createSimpleBus<T = unknown>() {
  const handlers = new Map<string, Set<(event: T) => void>>()
  return {
    subscribe(topic: string, handler: (event: T) => void) {
      let set = handlers.get(topic)
      if (!set) {
        set = new Set()
        handlers.set(topic, set)
      }
      set.add(handler)
    },
    publish(topic: string, payload: T) {
      handlers.get(topic)?.forEach((h) => {
        try { h(payload) }
        catch { /* 单个处理器失败不影响其他订阅者 */ }
      })
    },
  }
}