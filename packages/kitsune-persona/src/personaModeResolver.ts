import type { ModeResolution, PersonaConfig, PersonaMode, PersonaSessionState } from './types'

const MODE_KEYWORDS: Array<{ keywords: string[]; mode: PersonaMode }> = [
  { keywords: ['理性模式', 'rational mode'], mode: 'rational' },
  { keywords: ['偶像模式', 'idol mode'], mode: 'idol' },
  { keywords: ['严格模式', 'strict mode'], mode: 'strict' },
  { keywords: ['混合模式', 'hybrid mode'], mode: 'hybrid' },
]

/** 从用户输入中检测模式切换意图 */
export function detectModeFromInput(input: string): PersonaMode | null {
  const text = input?.toLowerCase() ?? ''
  if (!text) return null

  for (const { keywords, mode } of MODE_KEYWORDS) {
    if (keywords.some(kw => text.includes(kw))) return mode
  }
  return null
}

/** 解析当前应使用的人格模式 */
export function resolvePersonaMode(context: {
  input?: string
  sessionState?: PersonaSessionState | null
  config?: PersonaConfig
}): ModeResolution {
  if (context.sessionState?.mode) {
    return { mode: context.sessionState.mode, source: 'session' }
  }

  const fromInput = detectModeFromInput(context.input ?? '')
  if (fromInput) {
    return { mode: fromInput, source: 'input' }
  }

  return { mode: context.config?.defaults?.mode ?? 'hybrid', source: 'default' }
}
