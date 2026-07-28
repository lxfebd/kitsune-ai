export type VisionWorkloadId = 'screen:interpret' | 'screen:understand' | 'screen:ocr' | 'screen:ui-automation' | 'screen:verify'

export interface VisionWorkloadConfig {
  id: VisionWorkloadId
  label: string
  description: string
  prompt: string
}

/**
 * Vision check verify 判定 prompt 模板。
 * 由 VisionCheckBridge 注入 expectation 后使用，单独抽出以避免
 * workload 通用 prompt 与 bridge 内联 prompt 双重维护导致漂移。
 */
export const VISION_VERIFY_PROMPT = [
  'You are a strict visual verification judge.',
  'Given the screenshot and the following expectation, decide whether it is satisfied.',
  '{{EXPECTATION}}',
  'Respond with a single line only:',
  '- If satisfied, start with "PASS" then a short reason.',
  '- If not satisfied, start with "FAIL" then a short reason.',
  'Do not add any extra text, explanations, or markdown.',
].join('\n')

/** 把期望值填入 verify 模板，得到可直接作为 promptOverride 的完整 prompt。 */
export function buildVerifyPrompt(expectation: string): string {
  return VISION_VERIFY_PROMPT.replace('{{EXPECTATION}}', `Expectation: ${expectation || '(no expectation provided)'}`)
}

export const VISION_WORKLOADS: VisionWorkloadConfig[] = [
  {
    id: 'screen:interpret',
    label: 'Screen interpret',
    description: 'Summarize what is on screen and relevant UI state.',
    prompt: [
      'You are an on-device vision assistant.',
      'Interpret the current screen in a concise, structured summary:',
      '- identify the active app or page',
      '- list key UI elements and their states',
      '- call out user intent or next likely action',
      'Keep it factual and short, avoid speculation.',
    ].join('\n'),
  },
  {
    id: 'screen:understand',
    label: 'Screen understanding',
    description: 'Explain screen intent and key tasks.',
    prompt: [
      'Explain what the screen is for and what the user can do next.',
      'Focus on primary actions, warnings, and notable state changes.',
    ].join('\n'),
  },
  {
    id: 'screen:ocr',
    label: 'OCR focus',
    description: 'Extract readable text from the screen.',
    prompt: [
      'Extract visible text from the screen.',
      'Return plain text, preserve structure with line breaks when possible.',
    ].join('\n'),
  },
  {
    id: 'screen:ui-automation',
    label: 'UI automation',
    description: 'Describe actionable UI elements for automation.',
    prompt: [
      'Identify actionable UI elements (buttons, inputs, menus).',
      'Return a list of elements with labels and approximate purpose.',
    ].join('\n'),
  },
  {
    id: 'screen:verify',
    label: 'Verify expectation',
    description: 'Decide whether the screen satisfies a described expectation.',
    // 实际判定 prompt 由 useVisionCheckBridge 经 promptOverride 注入（含 expectation）。
    // 这里保留判定约束作为无 promptOverride 时的通用 fallback。
    prompt: [
      'You are a strict visual verification judge.',
      'Decide whether the screenshot satisfies the described expectation.',
      'Respond with a single line only:',
      '- If satisfied, start with "PASS" then a short reason.',
      '- If not satisfied, start with "FAIL" then a short reason.',
      'Do not add any extra text, explanations, or markdown.',
    ].join('\n'),
  },
]

export function getVisionWorkload(id: VisionWorkloadId) {
  return VISION_WORKLOADS.find(workload => workload.id === id) || VISION_WORKLOADS[0]
}
