/**
 * 内置操作指导规则库 — 桌宠「方法指导」能力的单一真源。
 *
 * ── 定位 ──
 * 当监工反复检测到同类工具失败（计数达到阈值）时，按 errorMessage / toolName
 * 匹配内置规则，给用户可操作的修复步骤。规则库随包分发、双语内嵌（zh + en），
 * 不走 settings.yaml —— 这是内部资源而非用户可编辑配置，保持自包含可审计。
 *
 * ── 匹配语义 ──
 * 每条规则可限定 source（缺省=所有来源）；match 是对
 *   `${errorMessage} ${toolName}`
 * 拼接串做不区分大小写的正则匹配。命中规则后，指导事件以
 *   title（zh/en 按当前语言取）+ steps（有序修复步骤）
 * 呈现。多规则同时命中时取 id 字典序第一条，保证确定性。
 */

export interface GuidanceLocalizedText {
  zh: string
  en: string
}

export interface BuiltInGuidanceRule {
  /** 稳定 id，持久化计数表以此关联 */
  id: string
  /** 匹配特征正则 — 对 errorMessage + toolName 拼接串（小写）做测试 */
  match: RegExp[]
  /** 可选来源限定（如 'zcode'）；缺省=匹配所有来源 */
  source?: string
  /** 卡片标题 + 桌宠台词 */
  title: GuidanceLocalizedText
  /** 有序修复步骤 */
  steps: GuidanceLocalizedText[]
  severity: 'info' | 'warn'
}

/** 内置规则库 — 按 id 字典序排序，保证「多规则命中取第一条」确定性 */
export const BUILT_IN_GUIDANCE_RULES: BuiltInGuidanceRule[] = [
  {
    id: 'mcp-connection',
    match: [/mcp.*(?:closed|disconnect|refused|无法连接)/, /transport.*(?:closed|disconnect)/, /connection.*(?:closed|refused)/],
    title: {
      zh: 'MCP 连接中断',
      en: 'MCP connection interrupted',
    },
    steps: [
      { zh: '确认 MCP server 进程仍在运行（任务管理器 / 本机服务列表）。', en: 'Confirm the MCP server process is still running (Task Manager / local services).' },
      { zh: '检查端口是否被占用：更换端口或结束占用进程后重启。', en: 'Check whether the port is occupied: change the port or kill the occupying process, then restart.' },
      { zh: '仍无法连接时重启应用，重建 MCP 连接。', en: 'If it still fails, restart the app to rebuild the MCP connection.' },
    ],
    severity: 'warn',
  },
  {
    id: 'model-json-corrupt',
    match: [/invalid json/, /json parsing failed/, /unexpected token/, /json.*parse/],
    title: {
      zh: '模型输出 JSON 损坏',
      en: 'Model output JSON is corrupted',
    },
    steps: [
      { zh: '单次损坏通常是偶发：直接重试即可恢复。', en: 'A single corruption is usually transient: just retry.' },
      { zh: '反复出现时切换模型，或让模型输出更短、更结构化的内容。', en: 'If it keeps happening, switch models or ask for shorter, more structured output.' },
    ],
    severity: 'warn',
  },
  {
    id: 'network-failure',
    match: [/\btimed?\s*out\b/, /\betimedout\b/, /\benotfound\b/, /\beconnrefused\b/, /网络/, /连接超时/],
    title: {
      zh: '网络请求失败',
      en: 'Network request failed',
    },
    steps: [
      { zh: '检查本机网络连接是否正常（能否打开网页）。', en: 'Check your network connection (can you open a webpage?).' },
      { zh: '下载/拉取资源时换用镜像源或代理再试。', en: 'For downloads/fetches, switch to a mirror or proxy and retry.' },
      { zh: '访问本地服务时确认目标服务已启动且端口未变。', en: 'For local services, confirm the target service is running and the port is unchanged.' },
    ],
    severity: 'warn',
  },
  {
    id: 'read-not-found',
    match: [/enoent/, /no such file/, /file not found/, /cannot find (?:module|file)/, /找不到文件/, /eacces/],
    title: {
      zh: '文件读取失败',
      en: 'File read failed',
    },
    steps: [
      { zh: '确认文件路径正确：检查大小写、相对/绝对路径。', en: 'Verify the path: check case and relative/absolute form.' },
      { zh: '确认文件确实存在于该位置（列出目录核对）。', en: 'Confirm the file exists there (list the directory to check).' },
      { zh: '权限不足时（EACCES）检查文件/目录的读写权限。', en: 'On EACCES, check read/write permissions on the file or directory.' },
    ],
    severity: 'warn',
  },
  {
    id: 'zcode-edit-mismatch',
    source: 'zcode',
    match: [/string not found/, /old_string/, /no changes to make/, /没有找到/, /未能匹配/],
    title: {
      zh: '编辑内容未匹配',
      en: 'Edit target did not match',
    },
    steps: [
      { zh: 'old_string 必须与文件当前内容精确一致（含缩进与换行）。', en: 'old_string must exactly match the file’s current content, including indentation and newlines.' },
      { zh: '编辑前先 Read 目标文件，复制当前内容再构造编辑。', en: 'Read the target file first, then build the edit from its current content.' },
    ],
    severity: 'warn',
  },
  {
    id: 'zcode-edit-not-read',
    source: 'zcode',
    match: [/file has not been read yet/, /尚未阅读/, /没有读取过/],
    title: {
      zh: '编辑前未读取文件',
      en: 'File not read before editing',
    },
    steps: [
      { zh: '先 Read 目标文件，再执行 Edit/Write。', en: 'Read the target file first, then run Edit/Write.' },
      { zh: '编辑时使用 Read 返回的当前内容构造 old_string，避免凭记忆写。', en: 'Build old_string from the content Read returned, not from memory.' },
    ],
    severity: 'warn',
  },
]

/** 对 errorMessage + toolName 拼接串做匹配，返回命中的规则（id 字典序第一条） */
export function matchRule(
  errorMessage: string,
  toolName?: string,
  source?: string,
): BuiltInGuidanceRule | null {
  if (!errorMessage)
    return null
  const haystack = `${errorMessage} ${toolName ?? ''}`.toLowerCase()
  for (const rule of BUILT_IN_GUIDANCE_RULES) {
    if (rule.source && source !== rule.source)
      continue
    if (rule.match.some(re => re.test(haystack)))
      return rule
  }
  return null
}

/** 按当前语言取本地化文本（缺省回退 en，再回退 zh） */
export function localize(text: GuidanceLocalizedText, lang: string): string {
  if (lang.startsWith('zh'))
    return text.zh
  return text.en
}
