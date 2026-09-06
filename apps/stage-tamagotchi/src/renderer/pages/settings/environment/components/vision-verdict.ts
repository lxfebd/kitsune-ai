/**
 * 解析视觉 LLM 的判定文本，提取 PASS / FAIL。
 *
 * 返回结果区分三种状态：
 * - { passed: true }                      明确通过
 * - { passed: false, unrecognized: false } 明确未通过（LLM 以 FAIL 开头）
 * - { passed: false, unrecognized: true }  无法解析（措辞偏移/截断），需由上层兜底
 *
 * 匹配尽量宽容：允许可选的 ✅/❌ emoji 前缀、大小写不敏感、接受 PASSED 等常见口语，
 * 以及 "The result is PASS: ..." 这类非严格行首锚定的兜底。
 */
export interface VisionVerdict {
  passed: boolean
  unrecognized: boolean
  reason: string
}

export function parseVerification(text: string): VisionVerdict {
  const trimmed = text.trim()

  // 优先严格匹配行首 PASS/FAIL（含可选 emoji 前缀，ED 可选）
  const strict = trimmed.match(/^(?:✅\s*|❌\s*)?(PASS|FAIL)(?:ED)?\b[:\s-]*(.*)$/is)
  if (strict) {
    const passed = strict[1].toUpperCase() === 'PASS'
    return {
      passed,
      unrecognized: false,
      reason: strict[2]?.trim() || (passed ? 'vision check passed' : 'vision check failed'),
    }
  }

  // 宽松兜底：文本中任何位置出现明确的 PASS/FAIL 关键词
  const loosePass = /\b(PASS(?:ED)?)\b/is.test(trimmed)
  const looseFail = /\b(FAIL(?:ED)?)\b/is.test(trimmed)
  if (loosePass && !looseFail) {
    return { passed: true, unrecognized: false, reason: 'vision check passed' }
  }
  if (looseFail && !loosePass) {
    return { passed: false, unrecognized: false, reason: 'vision check failed' }
  }

  // 仍无法判定：标记 unrecognized，交由上层按“保守未通过”处理但仍记录原始文本
  return {
    passed: false,
    unrecognized: true,
    reason: `unrecognized vision verdict: ${trimmed.slice(0, 200)}`,
  }
}
