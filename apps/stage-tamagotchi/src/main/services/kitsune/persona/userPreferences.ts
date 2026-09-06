import type { MemoryStore } from '../memory/store'

/**
 * 用户偏好提取器 — 从对话中提取用户偏好并写入 memory store。
 *
 * 与 memory/extractRules.ts 的 extractMemoryFromConversation 不同，
 * 此模块专注于 persona 相关的偏好（语气、风格、回复方式），
 * 以及代码风格偏好（缩进、命名等，供 codeStyleAnalyzer 参考）。
 */

/** 偏好提取正则模式 */
const PREFERENCE_PATTERNS: Array<{ pattern: RegExp, category: string }> = [
  // 语气/风格偏好
  { pattern: /以后.*(这样|这个风格|这种风格|这么回复)/, category: 'style' },
  { pattern: /(记住|记一下).*(回复|风格|语气|模式)/, category: 'style' },
  { pattern: /(always|from now on).*(reply|style|mode)/i, category: 'style' },
  // 代码风格偏好
  { pattern: /我(?:喜欢|习惯|偏好)(?:用)?(tab|space|空格|制表符)/i, category: 'code_indent' },
  { pattern: /我(?:喜欢|习惯|偏好)(?:用)?(camelCase|snake_case|kebab-case|帕斯卡)/i, category: 'code_naming' },
  { pattern: /我(?:喜欢|习惯|偏好)(?:用)?(const|let|var)/i, category: 'code_variable' },
  { pattern: /(单引号|双引号|single quote|double quote)/i, category: 'code_quote' },
  // 交互偏好
  { pattern: /(简洁|详细|简短|长一点|更多细节)/, category: 'response_length' },
  { pattern: /(中文回复|英文回复|用中文|用英文)/i, category: 'response_language' },
]

export interface ExtractedPreference {
  content: string
  category: string
}

/** 从对话中提取用户偏好 */
export function extractPreferences(userMessage: string, assistantMessage: string): ExtractedPreference[] {
  const preferences: ExtractedPreference[] = []
  const text = `${userMessage}\n${assistantMessage}`

  for (const { pattern, category } of PREFERENCE_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      preferences.push({
        content: match[0],
        category,
      })
    }
  }

  // 去重（同 category 只保留第一条）
  const seen = new Set<string>()
  return preferences.filter(p => {
    if (seen.has(p.category)) return false
    seen.add(p.category)
    return true
  })
}

/** 创建用户偏好提取器实例 */
export function createUserPreferenceExtractor(deps: { memoryStore: MemoryStore }) {
  return {
    /**
     * 从对话中提取偏好并写入 memory store。
     * 在 chat-sync.ts 流式完成后调用，与 extractMemoryFromConversation 并行。
     */
    async extractAndSave(userMessage: string, assistantMessage: string, sessionId: string): Promise<{ saved: number }> {
      const preferences = extractPreferences(userMessage, assistantMessage)
      let saved = 0

      for (const pref of preferences) {
        await deps.memoryStore.addEntry({
          content: `[用户偏好:${pref.category}] ${pref.content}`,
          type: 'preference',
          source: 'persona_extractor',
          sessionId,
        })
        saved++
      }

      return { saved }
    },
  }
}