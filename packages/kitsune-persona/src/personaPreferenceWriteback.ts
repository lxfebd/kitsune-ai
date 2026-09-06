import type { PersonaConfig, PersonaMode, PersonaMemoryStore } from './types'

const EXPLICIT_PREFERENCE_PATTERNS = [
  /以后.*(这样|这个风格|这种风格|这么回复)/,
  /(记住|记一下).*(回复|风格|语气|模式)/,
  /(always|from now on).*(reply|style|mode)/i,
]

/** 检测用户输入中的显式偏好信号 */
export function detectExplicitPreferenceSignal(input: string): string | null {
  const text = input ?? ''
  if (!text.trim()) return null

  for (const pattern of EXPLICIT_PREFERENCE_PATTERNS) {
    if (pattern.test(text)) return text
  }
  return null
}

/** 尝试将人格偏好持久化到记忆存储 */
export async function maybePersistPersonaPreference(context: {
  input: string
  mode: PersonaMode
  memoryStore?: PersonaMemoryStore | null
  sessionId?: string
  traceId?: string
  config?: PersonaConfig
}): Promise<{ persisted: boolean; reason?: string; entryId?: string }> {
  const { input, mode, memoryStore, sessionId, traceId, config } = context

  if (!memoryStore?.addEntry) return { persisted: false, reason: 'no_memory_store' }
  if (!config?.writeback?.enabled) return { persisted: false, reason: 'writeback_disabled' }

  const signal = detectExplicitPreferenceSignal(input)
  if (!signal) return { persisted: false, reason: 'no_explicit_signal' }

  const content = `Persona preference: preferred mode=${mode}; signal=${signal}`
  const entry = await memoryStore.addEntry({
    content,
    keywords: ['persona', 'preference', 'style', mode],
    source_session_id: sessionId,
    source_trace_id: traceId,
    metadata: { type: 'persona_preference', mode, explicit: true },
  })

  return { persisted: true, entryId: entry.id }
}
