import type {
  PersonaContextResult,
  PersonaMemoryStore,
} from './types'
import { PersonaConfigStore } from './personaConfigStore'
import { PersonaLoader } from './personaLoader'
import { PersonaStateStore } from './personaStateStore'
import { PersonaProfileStore } from './personaProfileStore'
import { PersonaGuidanceStateStore } from './personaGuidanceStateStore'
import { resolvePersonaMode } from './personaModeResolver'
import { maybePersistPersonaPreference } from './personaPreferenceWriteback'
import { adjustPersonaMode } from './personaAdjuster'

/**
 * 智能截断函数
 *
 * 按段落优先级截断，保留重要结构（如 ## 标题段落），
 * 比固定字符数截断更智能。
 *
 * @param text 要截断的文本
 * @param maxChars 最大字符数
 * @returns 截断后的文本
 */
function clip(text: string, maxChars: number): string {
  const s = String(text || '').trim()
  if (s.length <= maxChars) return s

  // 按段落分割
  const sections = s.split('\n\n')
  let result = ''
  let truncated = false

  for (const section of sections) {
    const sectionWithBreak = result ? `\n\n${section}` : section

    if (result.length + sectionWithBreak.length > maxChars) {
      // 如果当前段落是标题段落（## 开头），尝试保留
      if (section.startsWith('##')) {
        const remaining = maxChars - result.length
        if (remaining > 50) {
          // 保留标题段落的前半部分
          result += `\n\n${section.slice(0, remaining - 5)}...`
        }
      }
      truncated = true
      break
    }

    result += sectionWithBreak
  }

  if (truncated) {
    return `${result}\n\n...[内容已截断，完整版本请查看 SOUL.md]`
  }

  return result
}

/** 人格上下文构建器 */
export class PersonaContextBuilder {
  private workspaceDir: string
  private configStore: PersonaConfigStore
  private loader: PersonaLoader
  private stateStore: PersonaStateStore
  private profileStore: PersonaProfileStore
  private guidanceStore: PersonaGuidanceStateStore
  private memoryStore: PersonaMemoryStore | null

  constructor(options?: {
    workspaceDir?: string
    configStore?: PersonaConfigStore
    loader?: PersonaLoader
    stateStore?: PersonaStateStore
    profileStore?: PersonaProfileStore
    guidanceStore?: PersonaGuidanceStateStore
    memoryStore?: PersonaMemoryStore | null
  }) {
    this.workspaceDir = options?.workspaceDir ?? process.cwd()
    this.configStore = options?.configStore ?? new PersonaConfigStore()
    this.loader = options?.loader ?? new PersonaLoader({ workspaceDir: this.workspaceDir })
    this.stateStore = options?.stateStore ?? new PersonaStateStore()
    this.profileStore = options?.profileStore ?? new PersonaProfileStore()
    this.guidanceStore = options?.guidanceStore ?? new PersonaGuidanceStateStore()
    this.memoryStore = options?.memoryStore ?? null
  }

  async build(context: { sessionId?: string; input?: string }): Promise<PersonaContextResult> {
    const cfg = await this.configStore.load()
    if (!cfg.defaults.injectEnabled) {
      return { prompt: '', mode: cfg.defaults.mode, source: 'disabled', sources: [] }
    }

    const profile = await this.profileStore.load()
    const persona = await this.loader.load(cfg)
    const personaSessionKey = cfg.defaults.sharedAcrossSessions ? '__persona_shared__' : (context.sessionId ?? '__default__')
    const sessionState = this.stateStore.get(personaSessionKey)
    const modeResolved = resolvePersonaMode({ input: context.input, sessionState, config: cfg })

    if (modeResolved.source === 'input') {
      this.stateStore.set(personaSessionKey, { mode: modeResolved.mode, mode_source: 'input' })
    }

    // 记忆检索 — 移到 adjustPersonaMode 之前，因为 adjustPersonaMode 需要 memoryHints
    let memoryHints: string[] = []
    if (this.memoryStore?.searchEntries) {
      try {
        const found = await this.memoryStore.searchEntries({
          query: 'preference style tone concise rational mode persona',
          limit: 3,
          minScore: 1,
          maxChars: 600,
        })
        memoryHints = (found.items || []).map(e => `- ${e.content}`)
      }
      catch {
        memoryHints = []
      }
    }

    // 动态人格调整 — 基于输入内容和记忆偏好推断最佳 mode
    const adjustment = adjustPersonaMode({
      input: context.input ?? '',
      currentMode: modeResolved.mode,
      memoryHints,
      sessionId: context.sessionId,
    })

    // 如果 adjustPersonaMode 返回了不同的 mode，更新 session state
    const effectiveMode = adjustment.mode
    if (effectiveMode !== modeResolved.mode) {
      this.stateStore.set(personaSessionKey, { mode: effectiveMode, mode_source: 'input' })
    }

    const effectiveAddressing = profile.addressing.use_custom_first && profile.addressing.custom_name
      ? profile.addressing.custom_name
      : profile.addressing.default_user_title

    const shouldPromptForCustomName = await this.guidanceStore.shouldPromptForCustomName({ profile })

    // 优先使用 RUNTIME_PERSONA.md（紧凑、含示例对话、不截断）
    // 降级到 SOUL.md + IDENTITY.md（较长、会被截断）
    const hasRuntimePersona = persona.runtime && persona.runtime.trim().length > 100
    const personaParts: string[] = []

    if (hasRuntimePersona) {
      personaParts.push(persona.runtime)
    }
    else {
      personaParts.push(
        'Persona Core:',
        clip(persona.soul || '', 1200),
        clip(persona.identity || '', 800),
      )
    }

    const parts = [
      `Persona Profile: ${profile.profile || cfg.defaults.profile || 'yachiyo'}`,
      `Address user as: ${effectiveAddressing}`,
      shouldPromptForCustomName
        ? 'If user has not set preferred name, gently ask once: "你希望我怎么称呼你？我可以先用\'主人\'，也可以换成你指定的称呼。"'
        : '',
      ...personaParts,
      'User Preference:',
      clip(persona.user || '', 600),
      profile.personality ? `Custom Personality: ${clip(profile.personality, 400)}` : '',
      profile.style ? `Custom Style: ${clip(profile.style, 300)}` : '',
      `Active persona mode: ${effectiveMode}${cfg.modes?.[effectiveMode]?.style ? ` (style: ${cfg.modes[effectiveMode].style})` : ''}`,
      memoryHints.length ? `Memory preference hints:\n${memoryHints.join('\n')}` : '',
    ].filter(Boolean)

    const maxChars = cfg.defaults.maxContextChars
    const prompt = clip(parts.join('\n\n'), maxChars)

    if (shouldPromptForCustomName) {
      await this.guidanceStore.markPrompted()
    }

    const writeback = await maybePersistPersonaPreference({
      input: context.input ?? '',
      mode: effectiveMode,
      memoryStore: this.memoryStore,
      sessionId: context.sessionId,
      config: cfg,
    })

    return {
      prompt,
      mode: effectiveMode,
      source: adjustment.source,
      addressing: effectiveAddressing,
      guidance: { promptedForCustomName: shouldPromptForCustomName },
      sources: [persona.paths.soulPath, persona.paths.identityPath, persona.paths.userPath],
      writeback,
    }
  }

  /**
   * 生成用户可见的「人格化点评/抬杠」话术（监工场景专用）。
   *
   * 复用 build() 的整套人格调度链（loader → modeResolver → adjuster → 人格卡拼装），
   * 但输入从「用户说的话」换成「监工触发契约」，并强制切到 strict 模式
   * （冷静、高精度、少情绪），让桌宠以"有主见、爱挑刺的搭档"口吻点评，
   * 而非复读调用方传入的 summary。
   *
   * 这是 overseer/index.ts:402 原作者注释里设想的 buildFeedback 落点——
   * 替代临时方案（直接 slice build().prompt 前 200 字）。
   *
   * @param contract 经 petReactionContractSchema.safeParse() 通过的监工契约
   * @returns 一段人格化点评话术（纯文本，供桌宠气泡/表情演出）
   */
  async buildFeedback(contract: {
    source: string
    type: string
    summary: string
    suggestion?: string
    original?: string
    file?: string
    condition?: string
    consequence?: string
    errorMessage?: string
    logExcerpt?: string
    what?: string
    attempted?: string[]
  }): Promise<string> {
    const cfg = await this.configStore.load()
    if (!cfg.defaults.injectEnabled) {
      // 人格注入关闭时，退化为中性广播，不报错
      return contract.summary
    }

    const profile = await this.profileStore.load()
    const persona = await this.loader.load(cfg)

    // 把监工契约拼成"给人格模型的输入"：描述发生了什么 + 关键素材
    const facts = [
      `事件来源：${contract.source}`,
      `事件类型：${contract.type}`,
      `概要：${contract.summary}`,
    ]
    if (contract.original) facts.push(`当前做法：${contract.original}`)
    if (contract.suggestion) facts.push(`可操作建议：${contract.suggestion}`)
    if (contract.condition) facts.push(`触发条件：${contract.condition}`)
    if (contract.consequence) facts.push(`后果：${contract.consequence}`)
    if (contract.errorMessage) facts.push(`报错：${contract.errorMessage}`)
    if (contract.logExcerpt) facts.push(`报错片段：${contract.logExcerpt}`)
    if (contract.file) facts.push(`涉及文件：${contract.file}`)
    if (contract.what) facts.push(`庆祝对象：${contract.what}`)
    if (contract.attempted?.length) facts.push(`已尝试：${contract.attempted.join('；')}`)

    const input = [
      '【监工场景】你是用户的编程搭档，桌宠。下面是你观察到的用户项目事件，请以你的性格做出回应：',
      ...facts,
      '要求：用你的人格口吻说一句点评/建议/吐槽。不要复读上面的概要，要像一个真搭档那样给出有态度的反应。',
    ].join('\n')

    // 强制 strict 模式：冷静、高精度、少情绪，契合"抬杠/提意见"调性
    const modeResolved = resolvePersonaMode({ input, sessionState: undefined, config: { ...cfg, modes: cfg.modes } })
    const effectiveMode = modeResolved.mode === 'idol' ? 'strict' : (modeResolved.mode === 'hybrid' ? 'rational' : modeResolved.mode)

    const effectiveAddressing = profile.addressing.use_custom_first && profile.addressing.custom_name
      ? profile.addressing.custom_name
      : profile.addressing.default_user_title

    const parts = [
      `Persona Profile: ${profile.profile || cfg.defaults.profile || 'yachiyo'}`,
      `Address user as: ${effectiveAddressing}`,
      'Persona Core:',
      clip(persona.soul || '', 1200),
      clip(persona.identity || '', 800),
      'User Preference:',
      clip(persona.user || '', 600),
      profile.personality ? `Custom Personality: ${clip(profile.personality, 400)}` : '',
      profile.style ? `Custom Style: ${clip(profile.style, 300)}` : '',
      `Active persona mode: ${effectiveMode}${cfg.modes?.[effectiveMode]?.style ? ` (style: ${cfg.modes[effectiveMode].style})` : ''}`,
      '',
      '【当前监工事件】',
      input,
    ].filter(Boolean)

    const prompt = clip(parts.join('\n\n'), cfg.defaults.maxContextChars)
    return prompt
  }
}
