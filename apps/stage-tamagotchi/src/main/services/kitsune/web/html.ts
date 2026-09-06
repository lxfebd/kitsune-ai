/**
 * 纯 HTML → 文本工具，供内置网页工具（browser.navigate / browser.evaluate）使用。
 *
 * 不引入任何 HTML 解析依赖：只实现 tools.yaml 声明的三种选择器形态
 * （`#id`、`.class`、`tagname`），并用轻量标签扫描器提取匹配元素的文本。
 */

/** 无闭合标签的 HTML 元素。 */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

/** 整块丢弃的噪声标签（其内容不属于正文）。 */
const NOISE_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head'])

// HTML5：这些标签遇到同名开标签时隐式关闭前一个未闭合的同名开标签（如连续 <li>）。
// 其余同名标签可以合法嵌套（div>div、span>span），不能按隐式关闭处理，
// 否则外层元素会被提前截断、丢失闭合标签后的尾部文本。
const SELF_CLOSING_TAGS = new Set(['li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'p', 'rt', 'rp'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  middot: '·',
  deg: '°',
  plusmn: '±',
}

function codePointToChar(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff)
    return ''
  try {
    return String.fromCodePoint(code)
  }
  catch {
    return ''
  }
}

/**
 * 解码 HTML 实体（命名实体 + `&#123;` / `&#x1F600;` 数字实体）。
 *
 * 无法映射的实体原样保留，避免误吞未知语法。
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => codePointToChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePointToChar(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

/** 去掉全部标签并解码实体，返回纯文本。 */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
}

/**
 * 将 HTML 转为可读正文文本。
 *
 * 处理顺序：丢弃噪声块（script/style 等）→ 块级标签边界转行 → 剥离剩余标签 →
 * 解码实体 → 逐行去空白并丢弃空行。
 */
export function htmlToText(html: string): string {
  let text = html

  for (const tag of NOISE_TAGS)
    text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), '\n')

  text = text.replace(/<\/?(?:br|hr|div|p|li|ul|ol|table|thead|tbody|tr|td|th|h[1-6]|section|article|header|footer|blockquote|pre|figure|figcaption|nav|main|form|fieldset|dl|dt|dd|address)\b[^>]*>/gi, '\n')
  text = text.replace(/<[^>]*>/g, ' ')
  text = decodeEntities(text)

  return text
    .split(/\r?\n/)
    .map(line => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n')
}

/** 提取 `<title>` 内的纯文本；无标题时返回空串。 */
export function extractTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (!match)
    return ''
  return stripTags(match[1]).replace(/\s+/g, ' ').trim()
}

export interface ParsedSelector {
  kind: 'id' | 'class' | 'tag'
  value: string
}

/**
 * 解析受支持的选择器形态。
 *
 * Before:
 * - "#main" / ".content" / "ARTICLE"
 *
 * After:
 * - `{ kind: 'id', value: 'main' }` / `{ kind: 'class', value: 'content' }` / `{ kind: 'tag', value: 'article' }`
 *
 * 不支持复合/后代选择器（如 `.a .b`、`div.a`），抛出带提示的错误。
 */
export function parseSelector(selector: string): ParsedSelector {
  const trimmed = selector.trim()
  if (trimmed.startsWith('#')) {
    const value = trimmed.slice(1)
    if (!/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error(`Invalid id selector "${selector}".`)
    return { kind: 'id', value }
  }
  if (trimmed.startsWith('.')) {
    const value = trimmed.slice(1)
    if (!/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error(`Invalid class selector "${selector}".`)
    return { kind: 'class', value }
  }
  if (/^[A-Za-z][A-Za-z0-9-]*$/.test(trimmed))
    return { kind: 'tag', value: trimmed.toLowerCase() }
  throw new Error(`Unsupported CSS selector "${selector}". Use #id, .class, or tagname.`)
}

interface OpenElement {
  name: string
  id: string | undefined
  classes: string[]
  /** 标签结束后的正文起始位置（用于切片内层 HTML）。 */
  contentStart: number
}

function readAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  if (!match)
    return undefined
  return match[2] ?? match[3] ?? match[4]
}

function matches(element: OpenElement, selector: ParsedSelector): boolean {
  if (selector.kind === 'id')
    return element.id === selector.value
  if (selector.kind === 'class')
    return element.classes.includes(selector.value)
  return element.name === selector.value
}

interface MatchEntry {
  start: number
  end: number
  /** void 元素（img 等）没有正文，直接携带解码后的 alt/title 文本。 */
  text?: string
}

/**
 * 按 `#id` / `.class` / `tagname` 提取匹配元素的正文文本。
 *
 * 使用栈式标签扫描：闭合标签弹出到匹配的开标签为止（兼容未闭合标签），
 * HTML5 隐式关闭：仅 `<li>`/`<p>` 等标签遇到同名开标签时关闭前一个未闭合的同名开标签；
 * 其余同名标签可嵌套（div>div 合法），外层元素不会被提前截断。
 * 嵌套匹配只保留最外层（内层文本已包含在外层中），结果按文档顺序以换行连接。
 *
 * 无匹配时返回空串。
 */
export function extractBySelector(html: string, selector: string): string {
  const parsed = parseSelector(selector)
  const entries: MatchEntry[] = []
  const stack: OpenElement[] = []

  const pushMatch = (element: OpenElement, end: number) => {
    if (matches(element, parsed))
      entries.push({ start: element.contentStart, end })
  }

  const tagRe = /<!--[\s\S]*?-->|<[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[0]
    if (tag.startsWith('<!'))
      continue

    const contentStart = match.index + tag.length
    if (tag[1] === '/') {
      const name = /^<\/([A-Za-z][A-Za-z0-9-]*)/.exec(tag)?.[1]?.toLowerCase()
      if (!name)
        continue
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.name === name) {
          while (stack.length > i)
            pushMatch(stack.pop()!, match.index)
          break
        }
      }
      continue
    }

    const name = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(tag)?.[1]?.toLowerCase()
    if (!name)
      continue

    const element: OpenElement = {
      name,
      id: readAttribute(tag, 'id'),
      classes: (readAttribute(tag, 'class') ?? '').split(/\s+/).filter(Boolean),
      contentStart,
    }

    if (VOID_TAGS.has(name)) {
      // 无闭合标签：直接判定匹配；img 等元素暴露 alt 作为可提取文本。
      if (matches(element, parsed)) {
        const text = decodeEntities(readAttribute(tag, 'alt') ?? readAttribute(tag, 'title') ?? '')
        if (text)
          entries.push({ start: contentStart, end: contentStart, text })
      }
      continue
    }

    // HTML5 隐式闭合：仅 SELF_CLOSING_TAGS 中的标签（如连续 <li>）在遇到
    // 同名开标签时关闭前一个未闭合的同名开标签；其他标签允许同名嵌套
    // （div>div 合法），不能按隐式闭合处理，否则外层元素被提前截断。
    if (SELF_CLOSING_TAGS.has(name)) {
      while (stack.length > 0 && stack[stack.length - 1]!.name === name)
        pushMatch(stack.pop()!, match.index)
    }

    stack.push(element)
  }

  for (const element of stack)
    pushMatch(element, html.length)

  // 丢弃被其他匹配完全包含的区间（嵌套匹配去重），按文档顺序输出。
  const kept = entries
    .filter(entry => !entries.some((other) => other !== entry && other.start <= entry.start && entry.end <= other.end))
    .sort((a, b) => a.start - b.start)
    .map((entry) => {
      const text = entry.text ?? htmlToText(html.slice(entry.start, entry.end))
      return text.replace(/\s*\n\s*/g, '\n').trim()
    })
    .filter(Boolean)

  return kept.join('\n')
}
