/**
 * 桌面自动化安全沙箱
 *
 * 提供操作白名单、频率限制、敏感操作检测。
 */

/** 默认允许的操作类型 */
export const DEFAULT_ALLOWED_ACTIONS = new Set([
  'click', 'moveTo', 'drag', 'type', 'pressKey',
  'screenshot', 'getCursorPosition', 'findElement',
  'setOverlayInteractive',
])

/** 敏感键盘操作 — 需要二次确认 */
export const SENSITIVE_KEYS = new Set([
  'F4', 'ALT+F4', 'ALT+F2', 'ALT+TAB', 'CTRL+ALT+DEL',
  'LWIN', 'RWIN', 'ESC', 'ESCAPE',
  'CTRL+ESC', 'ALT+ESC',
])

/** 敏感操作类型 — 需要二次确认 */
const SENSITIVE_ACTIONS = new Set([
  'pressKey',
])

export class SafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SafetyError'
  }
}

export interface SafetyCheckResult {
  allowed: boolean
  /** 阻止原因；allowed 为 true 时可空 */
  reason?: string
}

/**
 * 桌面自动化安全检查。
 *
 * 返回结构化结果而非抛异常，使调用方既能同步判断（executor taskRunner）
 * 也能在 service 层按需决定是否抛出。敏感键检测传入原始 detail 字符串，
 * 调用方需传入可识别的键名（如 "ALT+F4"），而非序列化后的 JSON。
 */
export function safetyCheck(
  action: string,
  detail: string,
  options?: { allowedActions?: string[] },
): SafetyCheckResult {
  const allowed = options?.allowedActions
    ? new Set(options.allowedActions)
    : DEFAULT_ALLOWED_ACTIONS

  // 检查是否在白名单中
  if (!allowed.has(action))
    return { allowed: false, reason: `操作 "${action}" 不在白名单中` }

  // 检查键盘操作是否敏感（detail 应为键名，如 "ALT+F4"）
  if (SENSITIVE_ACTIONS.has(action) && SENSITIVE_KEYS.has(detail.toUpperCase()))
    return { allowed: false, reason: `敏感操作 "${detail}" 需要手动确认` }

  return { allowed: true }
}

/** 抛出版本，供 service 层需要立即阻断时使用 */
export function assertSafe(
  action: string,
  detail: string,
  options?: { allowedActions?: string[] },
): void {
  const result = safetyCheck(action, detail, options)
  if (!result.allowed)
    throw new SafetyError(result.reason ?? '操作被安全策略阻止')
}

/**
 * 判断操作是否为敏感操作
 */
export function isSensitiveAction(action: string, detail: string): boolean {
  return SENSITIVE_ACTIONS.has(action) && SENSITIVE_KEYS.has(detail.toUpperCase())
}