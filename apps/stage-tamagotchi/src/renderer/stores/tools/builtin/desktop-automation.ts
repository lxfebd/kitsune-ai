import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { defineInvoke } from '@moeru/eventa'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

import { electron } from '@kitsune/electron-eventa'
import { screenCaptureGetSources } from '@kitsune/electron-screen-capture'
import { getElectronEventaContext } from '@kitsune/electron-vueuse'
import { normalizeNullableAnyOf } from '@kitsune/stage-shared/json-schema'
import { electronDesktopAutomationInvoke } from '../../../../shared/eventa'
import type { ElectronDesktopAutomationInvokePayload, ElectronDesktopAutomationResult } from '../../../../shared/eventa'

// 单个共享 eventa context — 避免创建 5 个冗余 ipcRenderer listeners。
// 懒加载：模块作用域调用 getElectronEventaContext() 在无 Electron IPC 的
// 环境（测试 / 纯浏览器预览）会立即抛错，首次真正使用工具时才初始化。
let sharedContext: ReturnType<typeof getElectronEventaContext> | undefined

function getContext() {
  sharedContext ??= getElectronEventaContext()
  return sharedContext
}

function createInvokers() {
  const context = getContext()
  return {
    desktop: defineInvoke(context, electronDesktopAutomationInvoke),
    windowGetBounds: defineInvoke(context, electron.window.getBounds),
    windowSetBounds: defineInvoke(context, electron.window.setBounds),
    getAllDisplays: defineInvoke(context, electron.screen.getAllDisplays),
    getCursorScreenPoint: defineInvoke(context, electron.screen.getCursorScreenPoint),
    getScreenSources: defineInvoke(context, screenCaptureGetSources),
  }
}

type Invokers = ReturnType<typeof createInvokers>

let invokeCache: Invokers | undefined

function resolveInvokers(): Invokers {
  invokeCache ??= createInvokers()
  return invokeCache
}

// NOTICE: 之前 eventa defineInvoke 的 ctx.emit 间歇性结构化克隆序列化失败
// （conversion failure from {} / byte）。改用 ipcRenderer.invoke 后仍有偶发，
// 根因是 payload 或 response 携带不可结构化克隆的值（Vue Proxy / 函数 / Buffer）。
// 终极修复：在 IPC 两端都做 JSON round-trip，彻底剥除所有非可克隆属性。
let desktopInvokerCache: ((payload: ElectronDesktopAutomationInvokePayload) => Promise<ElectronDesktopAutomationResult>) | undefined

function resolveDesktopInvoker() {
  if (desktopInvokerCache)
    return desktopInvokerCache

  const ipcRenderer = window.electron?.ipcRenderer
  if (!ipcRenderer)
    throw new Error('ipcRenderer not available')

  desktopInvokerCache = async (payload: ElectronDesktopAutomationInvokePayload): Promise<ElectronDesktopAutomationResult> => {
    // NOTICE: 经 IPC 传 JSON 字符串而非对象。
    // Electron contextBridge + ipcRenderer.invoke 对纯对象偶发
    // "Error processing argument at index 0, conversion failure from {}"，
    // 即使 JSON.parse(JSON.stringify()) round-trip 后仍可能失败。
    // 字符串是 V8 structuredClone 的原语类型，永远可克隆，彻底消除该类错误。
    // 主进程侧 ipcMain.handle 同步改为 JSON.parse 入参 + JSON.stringify 出参。
    const requestBody = JSON.stringify(payload)
    try {
      const raw = await ipcRenderer.invoke('desktop-automation:invoke', requestBody)
      return JSON.parse(raw as string) as ElectronDesktopAutomationResult
    }
    catch (error) {
      console.error('[desktop-automation:invoke] FAILED', {
        action: payload.action,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
  return desktopInvokerCache
}

function resolveWindowInvoker() {
  return resolveInvokers().windowGetBounds
}

function resolveSetBoundsInvoker() {
  return resolveInvokers().windowSetBounds
}

function resolveDisplaysInvoker() {
  return resolveInvokers().getAllDisplays
}

function resolveMouseInvoker() {
  return resolveInvokers().getCursorScreenPoint
}

// NOTICE: 截图不走 resolveDesktopInvoker（自建 ipcRenderer.invoke 通道，间歇性
// "conversion failure from {}" 结构化克隆失败），而是复用项目已有的
// @kitsune/electron-screen-capture 截屏系统（走稳定 eventa IPC）。
// thumbnail 是 Uint8Array JPEG 字节，转 data URL 供视觉模型消费。
function resolveScreenSourcesInvoker() {
  return resolveInvokers().getScreenSources
}

// NOTICE: 统一截图入口，通过 eventa 调用 desktopCapturer.getSources。
// 与 screen_screenshot / screen_perceive / screen_analyze 共享。
// 不缓存：每次工具调用都重新截屏，避免视觉分析拿到过期画面。
async function captureScreenshotViaEventa(): Promise<string> {
  const invoker = resolveScreenSourcesInvoker()
  const sources = await invoker({ types: ['screen'] as Electron.SourcesOptions['types'] })
  if (!sources || sources.length === 0)
    throw new Error('未找到可用屏幕')
  const thumbnail = sources[0].thumbnail
  if (!thumbnail || thumbnail.length === 0)
    throw new Error('截图数据为空')
  const bytes = thumbnail instanceof Uint8Array ? thumbnail : new Uint8Array(thumbnail)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  const base64 = btoa(binary)
  return `data:image/jpeg;base64,${base64}`
}

/**
 * Shape of the `result` payload returned by the `findElement` desktop-automation action.
 * The IPC contract types `result` as `unknown` because it is shared across every action,
 * so callers narrow it per-action.
 */
interface FindElementInvokeResult {
  found?: boolean
  elements?: Array<{ label?: string, x: number, y: number, confidence?: number }>
}

function asFindElementResult(value: unknown): FindElementInvokeResult | undefined {
  return value as FindElementInvokeResult | undefined
}

// NOTICE:
// desktop_find_element / desktop_find_and_click / desktop_wait / desktop_type_into
// 原先走主进程 findElement，由主进程再 context.emit 回渲染进程做视觉推理
// （FindElementBridge.vue）。该 eventa 往返在传输大 base64 截图 payload 时偶发
// "Error processing argument at index 0, conversion failure from" V8 structuredClone
// 序列化错误。改为直接在本（渲染）进程内完成 截图 + 视觉推理 + JSON 解析，
// 完全绕开 IPC 往返，与 screen_perceive 的本地推理链路保持一致。

interface DetectedElement {
  label: string
  type: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

const FIND_ELEMENT_PROMPT_TEMPLATE = (description: string) => [
  'You are a precise UI element detector.',
  `Analyze the screenshot and find all UI elements matching this description: "${description}"`,
  '',
  'Return a JSON array of detected elements. Each element must have:',
  '- label: element text or identifier',
  '- type: element type (button, input, menu, link, icon, text, tab, checkbox, dropdown, etc.)',
  '- x: center X coordinate in pixels',
  '- y: center Y coordinate in pixels',
  '- width: element width in pixels',
  '- height: element height in pixels',
  '- confidence: detection confidence (0.0 to 1.0)',
  '',
  'Return ONLY the JSON array, no explanation.',
  'If no matching elements found, return an empty array: []',
  'Example: [{"label":"Submit","type":"button","x":450,"y":300,"width":100,"height":40,"confidence":0.95}]',
].join('\n')

function parseDetectedElements(text: string): DetectedElement[] {
  const trimmed = text.trim()

  // 尝试多种方式提取 JSON 数组
  let jsonString = ''

  // 方式1: 直接匹配 JSON 数组
  const jsonArrayMatch = trimmed.match(/\[[\s\S]*\]/)
  if (jsonArrayMatch)
    jsonString = jsonArrayMatch[0]

  // 方式2: 如果有代码块标记，提取代码块内容
  if (!jsonString) {
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) {
      const content = codeBlockMatch[1].trim()
      if (content.startsWith('['))
        jsonString = content
    }
  }

  // 方式3: 查找第一个 [ 到最后一个 ] 之间的内容
  if (!jsonString) {
    const firstBracket = trimmed.indexOf('[')
    const lastBracket = trimmed.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket)
      jsonString = trimmed.slice(firstBracket, lastBracket + 1)
  }

  if (!jsonString)
    return []

  try {
    const parsed = JSON.parse(jsonString)
    if (!Array.isArray(parsed))
      return []

    return parsed
      .filter((el: any) =>
        typeof el === 'object'
        && el !== null
        && typeof el.x === 'number'
        && typeof el.y === 'number',
      )
      .map((el: any) => ({
        label: String(el.label ?? ''),
        type: String(el.type ?? 'unknown'),
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width ?? 50),
        height: Math.round(el.height ?? 50),
        confidence: Math.min(1, Math.max(0, Number(el.confidence) || 0.5)),
      }))
  }
  catch {
    return []
  }
}

interface FindElementViaRendererResult {
  found: boolean
  elements: DetectedElement[]
  reason?: string
}

/**
 * 渲染进程内完成 UI 元素定位：截图 → 视觉推理 → JSON 解析。
 * 替代主进程 findElement 的 context.emit 往返，避免大截图 payload 的
 * structuredClone 序列化失败。
 */
async function findElementViaRenderer(description: string): Promise<FindElementViaRendererResult> {
  const imageDataUrl = await captureScreenshotViaEventa()
  const { useVisionInference } = await import('@kitsune/stage-ui/composables')
  const { runVisionInference } = useVisionInference()

  let text: string
  try {
    text = await runVisionInference({
      imageDataUrl,
      workloadId: 'screen:ui-automation',
      promptOverride: FIND_ELEMENT_PROMPT_TEMPLATE(description),
    })
  }
  catch (error) {
    const msg = String(error)
    if (msg.includes('not configured') || msg.includes('Vision model')) {
      return {
        found: false,
        elements: [],
        reason: '视觉模型未配置。请在设置 > 模型 > 视觉模型中选择一个支持图像的模型（如 GPT-4o、Gemini、Qwen-VL 等），然后重试。',
      }
    }
    throw error
  }

  const elements = parseDetectedElements(text)
  return {
    found: elements.length > 0,
    elements,
    reason: elements.length > 0
      ? `found ${elements.length} element(s)`
      : 'no matching elements found',
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const clickParams = z.object({
  x: z.number().describe('屏幕 X 坐标（像素）'),
  y: z.number().describe('屏幕 Y 坐标（像素）'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('鼠标按键，默认 left'),
})

const moveParams = z.object({
  x: z.number().describe('屏幕 X 坐标（像素）'),
  y: z.number().describe('屏幕 Y 坐标（像素）'),
})

const dragParams = z.object({
  fromX: z.number().describe('起始 X 坐标'),
  fromY: z.number().describe('起始 Y 坐标'),
  toX: z.number().describe('目标 X 坐标'),
  toY: z.number().describe('目标 Y 坐标'),
})

const typeParams = z.object({
  text: z.string().describe('要输入的文本内容'),
})

const keyParams = z.object({
  key: z.string().describe('按键名称，如 Enter, Tab, F4, Ctrl+C 等'),
})

const screenshotParams = z.object({}).strict()

const getMouseParams = z.object({}).strict()

const listDisplaysParams = z.object({}).strict()

const getWindowBoundsParams = z.object({}).strict()

const setWindowBoundsParams = z.object({
  x: z.union([z.number(), z.null()]).optional().describe('窗口 X 坐标'),
  y: z.union([z.number(), z.null()]).optional().describe('窗口 Y 坐标'),
  width: z.union([z.number().positive(), z.null()]).optional().describe('窗口宽度'),
  height: z.union([z.number().positive(), z.null()]).optional().describe('窗口高度'),
})

const perceiveParams = z.object({
  question: z.string().optional().describe('关于截图的问题，如"屏幕上有什么"'),
})

const findElementParams = z.object({
  description: z.string().describe('要查找的 UI 元素描述，如"提交按钮"、"搜索输入框"、"文件菜单"等'),
})

const findAndClickParams = z.object({
  description: z.string().describe('要查找并点击的 UI 元素描述，如"确认按钮"、"关闭按钮"等'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('鼠标按键，默认 left'),
})

const waitParams = z.object({
  description: z.string().describe('要等待出现的 UI 元素或状态描述，如"加载完成"、"登录对话框"等'),
  timeout: z.number().optional().describe('超时时间（毫秒），默认 10000'),
  interval: z.number().optional().describe('检查间隔（毫秒），默认 1000'),
})

const typeIntoParams = z.object({
  target: z.string().describe('要输入的输入框描述，如"搜索框"、"用户名输入框"等'),
  text: z.string().describe('要输入的文本内容'),
  clear: z.boolean().optional().describe('输入前是否清空输入框，默认 false'),
})

const scrollParams = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']).describe('滚动方向'),
  amount: z.number().optional().describe('滚动量（像素），默认 100'),
  x: z.number().optional().describe('滚动位置的 X 坐标（可选，默认屏幕中心）'),
  y: z.number().optional().describe('滚动位置的 Y 坐标（可选，默认屏幕中心）'),
})

const analyzeScreenParams = z.object({
  question: z.string().describe('关于屏幕的问题，如"当前应用是什么"、"有哪些可点击的按钮"等'),
  focus: z.enum(['elements', 'text', 'state', 'all']).optional().describe('分析重点：elements(元素)、text(文字)、state(状态)、all(全部)，默认 all'),
})

const executeSequenceParams = z.object({
  steps: z.array(z.object({
    action: z.enum(['click', 'type', 'pressKey', 'findAndClick', 'typeInto', 'wait', 'scroll', 'screenshot', 'moveTo']).describe('操作类型'),
    params: z.record(z.string(), z.any()).describe('操作参数'),
  })).describe('要执行的操作步骤列表'),
  stopOnError: z.boolean().optional().describe('出错时是否停止执行，默认 true'),
})

// NOTICE:
// .refine() 触发 Zod v4 的 toJSONSchema 内部 crash（schema._zod 为 undefined）。
// 移除 refine，改用 describe 提示 LLM 至少提供一个字段。运行时校验在 tool handler 中处理。
// 根因：xsschema@0.5.0-beta.2 + zod@4.3.6 的 toJSONSchema 递归遍历时
//       $ZodCustom wrapper 的子 schema 引用为 undefined。
// 移除条件：升级 xsschema 或 zod 修复 toJSONSchema 对 refine 的支持后可恢复。
const windowActionParams = z.object({
  title: z.string().optional().describe('窗口标题（模糊匹配），如"Chrome"、"记事本"等。与 processName 至少提供一个'),
  processName: z.string().optional().describe('进程名称，如"chrome"、"notepad"等。与 title 至少提供一个'),
})

const launchAppParams = z.object({
  command: z.string().describe('要启动的应用程序命令或路径，如"notepad"、"C:\\Program Files\\...\\app.exe"'),
  args: z.array(z.string()).optional().describe('命令行参数'),
})

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export async function desktopAutomationTools(): Promise<Tool[]> {
  return Promise.all([
    // ── 感知层 ──────────────────────────────────────────────────────────

    (async () => rawTool({
      name: 'screen_screenshot',
      description: '截取当前屏幕截图，返回 JPEG 图片的 data URL。用于查看屏幕上正在显示什么内容。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(screenshotParams) as JsonSchema),
      execute: async () => {
        const imageDataUrl = await captureScreenshotViaEventa()
        return { imageDataUrl }
      },
    }))(),

    (async () => rawTool({
      name: 'screen_perceive',
      description: '截取屏幕截图并用 AI 视觉模型分析屏幕内容。可以提问来获取特定信息，如"屏幕上打开了什么应用"、"鼠标在什么位置"等。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(perceiveParams) as JsonSchema),
      execute: async (input) => {
        const { question } = input as { question?: string }
        const imageDataUrl = await captureScreenshotViaEventa()
        const { useVisionOrchestratorStore } = await import('@kitsune/stage-ui/stores/modules/vision')
        const visionOrchestrator = useVisionOrchestratorStore()
        try {
          const visionResult = await visionOrchestrator.processCapture({
            imageDataUrl,
            workloadId: 'screen:interpret',
            publishContext: false,
          })
          return {
            question: question ?? '请描述屏幕上的内容',
            visionResult: visionResult.text,
          }
        }
        catch (error) {
          const msg = String(error)
          if (msg.includes('not configured') || msg.includes('Vision model')) {
            return {
              error: '视觉模型未配置。请在设置 > 模型 > 视觉模型中选择一个支持图像的模型（如 GPT-4o、Gemini、Qwen-VL 等），然后重试。',
              screenshotTaken: true,
            }
          }
          throw error
        }
      },
    }))(),

    (async () => rawTool({
      name: 'screen_list_displays',
      description: '获取所有连接的显示器信息，包括分辨率、位置、工作区域等。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(listDisplaysParams) as JsonSchema),
      execute: async () => {
        const invoker = resolveDisplaysInvoker()
        const displays = await invoker()
        return {
          displays: displays.map((d: any) => ({
            id: d.id,
            label: d.label,
            bounds: d.bounds,
            workArea: d.workArea,
            scaleFactor: d.scaleFactor,
            rotation: d.rotation,
            isPrimary: d.id === displays[0]?.id,
          })),
        }
      },
    }))(),

    (async () => rawTool({
      name: 'screen_get_mouse',
      description: '获取当前鼠标光标的屏幕坐标。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(getMouseParams) as JsonSchema),
      execute: async () => {
        const invoker = resolveMouseInvoker()
        const point = await invoker()
        return { x: point.x, y: point.y }
      },
    }))(),

    // ── 执行层 ──────────────────────────────────────────────────────────

    (async () => rawTool({
      name: 'desktop_click',
      description: '在屏幕指定坐标位置点击鼠标。会先移动鼠标到目标位置再点击。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(clickParams) as JsonSchema),
      execute: async (input) => {
        const { x, y, button } = input as { x: number, y: number, button?: string }
        const invoker = resolveDesktopInvoker()
        await invoker({ action: 'moveTo', params: { x, y } })
        const result = await invoker({ action: 'click', params: { button: (button ?? 'left') as any } })
        if (!result.ok)
          throw new Error(result.error ?? '点击失败')
        return { ok: true, x, y, button: button ?? 'left' }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_move',
      description: '将鼠标光标移动到屏幕指定坐标位置。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(moveParams) as JsonSchema),
      execute: async (input) => {
        const { x, y } = input as { x: number, y: number }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'moveTo', params: { x, y } })
        if (!result.ok)
          throw new Error(result.error ?? '移动失败')
        return { ok: true, x, y }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_drag',
      description: '从起始坐标拖拽鼠标到目标坐标。用于拖动文件、选择文本等操作。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(dragParams) as JsonSchema),
      execute: async (input) => {
        const { fromX, fromY, toX, toY } = input as { fromX: number, fromY: number, toX: number, toY: number }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({
          action: 'drag',
          params: { from: { x: fromX, y: fromY }, to: { x: toX, y: toY } },
        })
        if (!result.ok)
          throw new Error(result.error ?? '拖拽失败')
        return { ok: true, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_type',
      description: '通过键盘输入文本内容。支持中英文和特殊字符。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(typeParams) as JsonSchema),
      execute: async (input) => {
        const { text } = input as { text: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'type', params: { text } })
        if (!result.ok)
          throw new Error(result.error ?? '输入失败')
        return { ok: true, text }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_key',
      description: '按下指定的键盘按键或快捷键组合。支持如 Enter, Tab, F4, Ctrl+C, Alt+F4 等。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(keyParams) as JsonSchema),
      execute: async (input) => {
        const { key } = input as { key: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'pressKey', params: { key } })
        if (!result.ok)
          throw new Error(result.error ?? '按键失败')
        return { ok: true, key }
      },
    }))(),

    // ── 窗口管理 ────────────────────────────────────────────────────────

    (async () => rawTool({
      name: 'window_get_bounds',
      description: '获取当前应用窗口的位置和大小。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(getWindowBoundsParams) as JsonSchema),
      execute: async () => {
        const invoker = resolveWindowInvoker()
        const bounds = await invoker()
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        }
      },
    }))(),

    (async () => rawTool({
      name: 'window_set_bounds',
      description: '移动或调整当前应用窗口的位置和大小。只需传入要修改的属性，未传入的属性保持不变。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(setWindowBoundsParams) as JsonSchema),
      execute: async (input) => {
        const { x, y, width, height } = input as { x?: number | null, y?: number | null, width?: number | null, height?: number | null }
        const getInvoker = resolveWindowInvoker()
        const currentBounds = await getInvoker()
        const setInvoker = resolveSetBoundsInvoker()
        // NOTICE: setBounds payload is Parameters<BrowserWindow['setBounds']> = [Rectangle, boolean?]
        // Must wrap in array to match the tuple type.
        await setInvoker([{
          x: x ?? currentBounds.x,
          y: y ?? currentBounds.y,
          width: width ?? currentBounds.width,
          height: height ?? currentBounds.height,
        }])
        return {
          ok: true,
          bounds: {
            x: x ?? currentBounds.x,
            y: y ?? currentBounds.y,
            width: width ?? currentBounds.width,
            height: height ?? currentBounds.height,
          },
        }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_list_windows',
      description: '列出所有可见的窗口，包括标题、进程名、位置、大小、状态等信息。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(z.object({}).strict()) as JsonSchema),
      execute: async () => {
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'listWindows', params: {} })
        if (!result.ok)
          throw new Error(result.error ?? '获取窗口列表失败')
        return result.result
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_focus_window',
      description: '将指定窗口切换到前台并获得焦点。可通过窗口标题或进程名指定窗口。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(windowActionParams) as JsonSchema),
      execute: async (input) => {
        const { title, processName } = input as { title?: string, processName?: string }
        if (!title && !processName)
          return { ok: false, error: '需要提供 title 或 processName 参数' }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'focusWindow', params: { title, processName } })
        if (!result.ok)
          throw new Error(result.error ?? '切换窗口失败')
        return { ok: true, focused: result.result, title, processName }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_maximize_window',
      description: '将指定窗口最大化。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(windowActionParams) as JsonSchema),
      execute: async (input) => {
        const { title, processName } = input as { title?: string, processName?: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'maximizeWindow', params: { title, processName } })
        if (!result.ok)
          throw new Error(result.error ?? '最大化窗口失败')
        return { ok: true, maximized: result.result, title, processName }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_minimize_window',
      description: '将指定窗口最小化到任务栏。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(windowActionParams) as JsonSchema),
      execute: async (input) => {
        const { title, processName } = input as { title?: string, processName?: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'minimizeWindow', params: { title, processName } })
        if (!result.ok)
          throw new Error(result.error ?? '最小化窗口失败')
        return { ok: true, minimized: result.result, title, processName }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_restore_window',
      description: '将最小化的窗口恢复到之前的大小和位置。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(windowActionParams) as JsonSchema),
      execute: async (input) => {
        const { title, processName } = input as { title?: string, processName?: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'restoreWindow', params: { title, processName } })
        if (!result.ok)
          throw new Error(result.error ?? '恢复窗口失败')
        return { ok: true, restored: result.result, title, processName }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_close_window',
      description: '关闭指定窗口。请谨慎使用，未保存的数据可能丢失。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(windowActionParams) as JsonSchema),
      execute: async (input) => {
        const { title, processName } = input as { title?: string, processName?: string }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'closeWindow', params: { title, processName } })
        if (!result.ok)
          throw new Error(result.error ?? '关闭窗口失败')
        return { ok: true, closed: result.result, title, processName }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_launch_app',
      description: '启动一个应用程序。返回进程 ID。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(launchAppParams) as JsonSchema),
      execute: async (input) => {
        const { command, args = [] } = input as { command: string, args?: string[] }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'launchApp', params: { command, args } })
        if (!result.ok)
          throw new Error(result.error ?? '启动应用失败')
        return result.result
      },
    }))(),

    // ── 视觉定位 ──────────────────────────────────────────────────────

    (async () => rawTool({
      name: 'desktop_find_element',
      description: '使用 AI 视觉模型在屏幕上查找指定的 UI 元素。返回元素的坐标、尺寸和置信度。用于自动化操作前定位按钮、输入框、菜单等元素。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(findElementParams) as JsonSchema),
      execute: async (input) => {
        const { description } = input as { description: string }
        return findElementViaRenderer(description)
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_find_and_click',
      description: '使用 AI 视觉模型在屏幕上查找指定的 UI 元素并点击。自动定位元素中心坐标后执行点击操作。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(findAndClickParams) as JsonSchema),
      execute: async (input) => {
        const { description, button } = input as { description: string, button?: string }

        // 1. 视觉定位元素（渲染进程内直接推理，不走 IPC 往返）
        const findResult = await findElementViaRenderer(description)
        if (!findResult.found || findResult.elements.length === 0)
          return { ok: false, error: `未找到匹配的元素: "${description}"` }

        // 2. 选择置信度最高的元素
        const bestElement = findResult.elements.reduce((best, el) =>
          el.confidence > best.confidence ? el : best,
        )

        // 3. 点击元素中心（走 IPC 的 moveTo + click）
        const invoker = resolveDesktopInvoker()
        await invoker({ action: 'moveTo', params: { x: bestElement.x, y: bestElement.y } })
        const clickResult = await invoker({ action: 'click', params: { button: (button ?? 'left') as any } })
        if (!clickResult.ok)
          throw new Error(clickResult.error ?? '点击失败')

        return {
          ok: true,
          element: bestElement,
          allElements: findResult.elements,
        }
      },
    }))(),

    // ── 感知-行动闭环 ────────────────────────────────────────────────

    (async () => rawTool({
      name: 'desktop_wait',
      description: '等待屏幕上出现指定的 UI 元素或状态。循环截图+视觉检测，直到找到目标或超时。用于等待加载完成、对话框出现等场景。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(waitParams) as JsonSchema),
      execute: async (input) => {
        const { description, timeout = 10000, interval = 1000 } = input as { description: string, timeout?: number, interval?: number }
        const invoker = resolveDesktopInvoker()
        const startTime = Date.now()
        let attempts = 0

        while (Date.now() - startTime < timeout) {
          attempts++

          // 视觉定位元素（渲染进程内直接推理）
          const findResult = await findElementViaRenderer(description)
          if (findResult.found && findResult.elements.length > 0) {
            return {
              ok: true,
              found: true,
              element: findResult.elements[0],
              attempts,
              elapsed: Date.now() - startTime,
            }
          }

          // 等待后重试
          if (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, interval))
          }
        }

        return {
          ok: false,
          found: false,
          error: `等待超时: "${description}"`,
          attempts,
          elapsed: Date.now() - startTime,
        }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_type_into',
      description: '使用 AI 视觉模型找到输入框，点击聚焦后输入文本。支持可选的清空操作。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(typeIntoParams) as JsonSchema),
      execute: async (input) => {
        const { target, text, clear = false } = input as { target: string, text: string, clear?: boolean }

        // 1. 视觉定位输入框（渲染进程内直接推理，不走 IPC 往返）
        const findResult = await findElementViaRenderer(target)
        if (!findResult.found || findResult.elements.length === 0)
          return { ok: false, error: `未找到输入框: "${target}"` }

        // 2. 选择置信度最高的元素
        const bestElement = findResult.elements.reduce((best, el) =>
          el.confidence > best.confidence ? el : best,
        )

        // 3. 点击输入框聚焦（走 IPC 的 moveTo + click）
        const invoker = resolveDesktopInvoker()
        await invoker({ action: 'moveTo', params: { x: bestElement.x, y: bestElement.y } })
        await invoker({ action: 'click', params: { button: 'left' } })

        // 4. 可选：清空输入框（Ctrl+A 然后 Delete）
        if (clear) {
          await invoker({ action: 'pressKey', params: { key: 'Ctrl+A' } })
          await invoker({ action: 'pressKey', params: { key: 'Delete' } })
        }

        // 5. 输入文本
        await invoker({ action: 'type', params: { text } })

        return {
          ok: true,
          element: bestElement,
          text,
          cleared: clear,
        }
      },
    }))(),

    (async () => rawTool({
      name: 'desktop_scroll',
      description: '在屏幕指定位置滚动页面。支持上下左右四个方向。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(scrollParams) as JsonSchema),
      execute: async (input) => {
        const { direction, amount = 100, x, y } = input as { direction: 'up' | 'down' | 'left' | 'right', amount?: number, x?: number, y?: number }
        const invoker = resolveDesktopInvoker()
        const result = await invoker({ action: 'scroll', params: { direction, amount, x, y } })
        if (!result.ok)
          throw new Error(result.error ?? '滚动失败')
        return { ok: true, direction, amount, x, y }
      },
    }))(),

    (async () => rawTool({
      name: 'screen_analyze',
      description: '截取屏幕截图并用 AI 视觉模型深度分析。返回结构化的屏幕状态信息，包括活跃应用、UI 元素、文字内容、当前状态等。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(analyzeScreenParams) as JsonSchema),
      execute: async (input) => {
        const { question, focus = 'all' } = input as { question: string, focus?: string }
        const imageDataUrl = await captureScreenshotViaEventa()
        const { useVisionOrchestratorStore } = await import('@kitsune/stage-ui/stores/modules/vision')
        const visionOrchestrator = useVisionOrchestratorStore()
        try {
          const visionResult = await visionOrchestrator.processCapture({
            imageDataUrl,
            workloadId: 'screen:understand',
            publishContext: false,
          })
          return {
            question,
            focus,
            visionResult: visionResult.text,
          }
        }
        catch (error) {
          const msg = String(error)
          if (msg.includes('not configured') || msg.includes('Vision model')) {
            return {
              error: '视觉模型未配置。请在设置 > 模型 > 视觉模型中选择一个支持图像的模型（如 GPT-4o、Gemini、Qwen-VL 等），然后重试。',
              screenshotTaken: true,
            }
          }
          throw error
        }
      },
    }))(),

    // ── 组合操作 ──────────────────────────────────────────────────────

    (async () => rawTool({
      name: 'desktop_execute_sequence',
      description: '按顺序执行多个桌面自动化操作。支持的操作类型：click、type、pressKey、findAndClick、typeInto、wait、scroll、screenshot、moveTo。用于执行复杂的多步骤任务。',
      parameters: normalizeNullableAnyOf(await toJsonSchema(executeSequenceParams) as JsonSchema),
      execute: async (input) => {
        const { steps, stopOnError = true } = input as { steps: Array<{ action: string, params: Record<string, any> }>, stopOnError?: boolean }
        const invoker = resolveDesktopInvoker()
        const results: Array<{ step: number, action: string, ok: boolean, result?: any, error?: string }> = []

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          const { action, params } = step

          try {
            let result: any

            switch (action) {
              case 'click': {
                const { x, y, button = 'left' } = params
                await invoker({ action: 'moveTo', params: { x, y } })
                result = await invoker({ action: 'click', params: { button } })
                break
              }
              case 'type': {
                result = await invoker({ action: 'type', params: { text: params.text } })
                break
              }
              case 'pressKey': {
                result = await invoker({ action: 'pressKey', params: { key: params.key } })
                break
              }
              case 'moveTo': {
                result = await invoker({ action: 'moveTo', params: { x: params.x, y: params.y } })
                break
              }
              case 'findAndClick': {
                // 视觉定位 + 点击
                const findResult = await invoker({ action: 'findElement', params: { description: params.description } })
                const findData = asFindElementResult(findResult.result)
                const foundElement = findData?.found ? findData.elements?.[0] : undefined
                if (findResult.ok && foundElement) {
                  await invoker({ action: 'moveTo', params: { x: foundElement.x, y: foundElement.y } })
                  result = await invoker({ action: 'click', params: { button: params.button ?? 'left' } })
                } else {
                  throw new Error(`未找到元素: "${params.description}"`)
                }
                break
              }
              case 'typeInto': {
                // 视觉定位输入框 + 输入
                const findResult = await invoker({ action: 'findElement', params: { description: params.target } })
                const findData = asFindElementResult(findResult.result)
                const targetElement = findData?.found ? findData.elements?.[0] : undefined
                if (findResult.ok && targetElement) {
                  await invoker({ action: 'moveTo', params: { x: targetElement.x, y: targetElement.y } })
                  await invoker({ action: 'click', params: { button: 'left' } })
                  if (params.clear) {
                    await invoker({ action: 'pressKey', params: { key: 'Ctrl+A' } })
                    await invoker({ action: 'pressKey', params: { key: 'Delete' } })
                  }
                  result = await invoker({ action: 'type', params: { text: params.text } })
                } else {
                  throw new Error(`未找到输入框: "${params.target}"`)
                }
                break
              }
              case 'wait': {
                const { description, timeout = 10000, interval = 1000 } = params
                const startTime = Date.now()
                let found = false
                while (Date.now() - startTime < timeout) {
                  const findResult = await invoker({ action: 'findElement', params: { description } })
                  if (findResult.ok && asFindElementResult(findResult.result)?.found) {
                    found = true
                    result = findResult.result
                    break
                  }
                  await new Promise(resolve => setTimeout(resolve, interval))
                }
                if (!found) {
                  throw new Error(`等待超时: "${description}"`)
                }
                break
              }
              case 'scroll': {
                // 通过 IPC 调用主进程的 scroll 方法
                const { direction, amount = 100, x, y } = params
                result = await invoker({ action: 'scroll', params: { direction, amount, x, y } })
                if (!result.ok) {
                  throw new Error(result.error ?? '滚动失败')
                }
                break
              }
              case 'screenshot': {
                result = await invoker({ action: 'screenshot', params: {} })
                break
              }
              default:
                throw new Error(`未知操作: ${action}`)
            }

            results.push({ step: i + 1, action, ok: true, result })
          }
          catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            results.push({ step: i + 1, action, ok: false, error: errorMsg })

            if (stopOnError) {
              return {
                ok: false,
                error: `步骤 ${i + 1} 失败: ${errorMsg}`,
                results,
                completedSteps: i,
                totalSteps: steps.length,
              }
            }
          }
        }

        return {
          ok: true,
          results,
          completedSteps: steps.length,
          totalSteps: steps.length,
        }
      },
    }))(),
  ])
}
