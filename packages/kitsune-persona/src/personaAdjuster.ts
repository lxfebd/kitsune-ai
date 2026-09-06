import type { PersonaMode } from './types'
import { detectModeFromInput } from './personaModeResolver'

/**
 * 动态人格调整输入。
 *
 * @param input 用户当前输入文本
 * @param currentMode 当前会话的 persona mode
 * @param memoryHints 从记忆存储检索到的偏好提示
 * @param sessionId 当前会话 ID
 */
export interface AdjustmentInput {
  input: string
  currentMode: PersonaMode
  memoryHints: string[]
  sessionId?: string
}

/**
 * 动态人格调整结果。
 *
 * @param mode 调整后的 mode
 * @param reason 调整原因（人类可读，用于审计日志）
 * @param source 调整来源：keyword=关键词触发，semantic=语义推断，memory=记忆偏好，default=保持原 mode
 */
export interface AdjustmentResult {
  mode: PersonaMode
  reason: string
  source: 'keyword' | 'semantic' | 'memory' | 'default'
}

// 语义推断特征词表 — 当无显式关键词时，根据输入内容推断合适的 mode
const SEMANTIC_RULES: Array<{ patterns: RegExp[], mode: PersonaMode, reason: string }> = [
  {
    patterns: [/bug|error|debug|编译|typecheck|lint|crash|报错|异常|堆栈|traceback|fix|修复|排查/i],
    mode: 'rational',
    reason: '输入包含技术/排错关键词，切换到理性模式',
  },
  {
    patterns: [/故事|写诗|写首诗|角色|创作|小说|散文|歌词|感受|心情|陪伴|聊天|娱乐/i],
    mode: 'idol',
    reason: '输入包含创作/情感关键词，切换到偶像模式',
  },
  {
    patterns: [/精确|严格|必须|不要|禁止|确保|务必|严格按照|不要输出/i],
    mode: 'strict',
    reason: '输入包含高精度要求关键词，切换到严格模式',
  },
]

/**
 * 根据对话上下文动态调整 persona mode。
 *
 * 优先级：
 * 1. 关键词检测（"理性模式"/"rational mode" 等显式指令）— 最高优先级，用户主动切换
 * 2. 记忆偏好 — 如果 memoryHints 包含 persona_preference 且 explicit:true，采用记忆中的 mode
 * 3. 语义推断 — 根据输入内容的特征词推断 mode
 * 4. 默认 — 保持 currentMode
 *
 * @returns 调整结果，包含新 mode、原因和来源
 */
export function adjustPersonaMode(input: AdjustmentInput): AdjustmentResult {
  // 1. 关键词检测（最高优先级）
  const keywordMode = detectModeFromInput(input.input ?? '')
  if (keywordMode) {
    return {
      mode: keywordMode,
      reason: '用户输入包含模式关键词',
      source: 'keyword',
    }
  }

  // 2. 记忆偏好（显式偏好信号优先）
  // memoryHints 格式为 ["- Persona preference: preferred mode=idol; signal=...", "- 用户喜欢简洁回复"]
  for (const hint of input.memoryHints) {
    const match = hint.match(/preferred mode=(\w+)/)
    if (match) {
      const memoryMode = match[1] as PersonaMode
      if (['rational', 'idol', 'hybrid', 'strict'].includes(memoryMode)) {
        return {
          mode: memoryMode,
          reason: `记忆中存在显式偏好: mode=${memoryMode}`,
          source: 'memory',
        }
      }
    }
  }

  // 3. 语义推断
  const text = input.input ?? ''
  if (text.trim()) {
    for (const rule of SEMANTIC_RULES) {
      if (rule.patterns.some(p => p.test(text))) {
        return {
          mode: rule.mode,
          reason: rule.reason,
          source: 'semantic',
        }
      }
    }
  }

  // 4. 默认保持
  return {
    mode: input.currentMode,
    reason: '无匹配规则，保持当前 mode',
    source: 'default',
  }
}