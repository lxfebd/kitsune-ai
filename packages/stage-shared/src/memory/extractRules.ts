/**
 * 简单规则based记忆提取 — 阶段 1 实现。
 *
 * 从用户和 AI 的对话中提取值得记忆的信息：
 * - 用户偏好（"我喜欢/讨厌/习惯..."）
 * - 事实陈述（"我是/我做/我用..."）
 * - 任务结论（"完成了/失败了/决定..."）
 *
 * 后续可替换为 LLM 提取。
 *
 * 放在 stage-shared 以便主进程和渲染进程都能直接 import（spec 方案 A）。
 */

export interface ExtractedEntry {
  content: string
  type: 'preference' | 'fact' | 'event'
}

const PATTERNS: Array<{ pattern: RegExp, type: ExtractedEntry['type'] }> = [
  { pattern: /我喜欢|我讨厌|我习惯|我偏好|我用|我喜欢用/i, type: 'preference' },
  { pattern: /我是|我做|我正在|我准备|我打算/i, type: 'fact' },
  { pattern: /完成了|失败了|决定了|确定|结论/i, type: 'event' },
]

/**
 * 从一轮对话（用户消息 + 助手消息）中提取值得记忆的条目。
 *
 * 提取策略：正则匹配关键词 → 截取关键词前后 25 字符作为上下文 → 去重 → 限制 5 条。
 * 返回的 `content` 是包含触发词的上下文片段，`type` 标注记忆类别。
 */
export function extractMemoryFromConversation(userMessage: string, assistantMessage: string): ExtractedEntry[] {
  const entries: ExtractedEntry[] = []
  const fullText = `${userMessage}\n${assistantMessage}`

  for (const { pattern, type } of PATTERNS) {
    const matches = fullText.match(new RegExp(pattern.source, 'gi'))
    if (matches) {
      for (const match of matches) {
        const idx = fullText.indexOf(match)
        const start = Math.max(0, idx - 25)
        const end = Math.min(fullText.length, idx + match.length + 25)
        const context = fullText.slice(start, end).trim()
        entries.push({ content: context, type })
      }
    }
  }

  // 去重 + 限制数量
  const seen = new Set<string>()
  return entries.filter((e) => {
    if (seen.has(e.content))
      return false
    seen.add(e.content)
    return true
  }).slice(0, 5)
}
