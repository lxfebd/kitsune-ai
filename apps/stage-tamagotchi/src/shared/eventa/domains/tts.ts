// Domain: tts — eventa IPC 契约按域拆分
import { defineInvokeEventa, defineEventa } from '@moeru/eventa'

export type TtsEngine = string

export interface TtsEngineInfo {
  id: TtsEngine
  name: string
  available: boolean
  /** 不可用原因（available=false 时由后端填充，供 UI 展示诊断信息）。 */
  reason?: string
}

export const electronTtsGetEngines = defineInvokeEventa<TtsEngineInfo[]>('eventa:invoke:electron:tts:get-engines')
export const electronTtsSetEngine = defineInvokeEventa<void, { engine: TtsEngine }>('eventa:invoke:electron:tts:set-engine')
export const electronTtsCurrentEngine = defineInvokeEventa<TtsEngine>('eventa:invoke:electron:tts:current-engine')
export { electronTtsListVoices, electronTtsImportVoicePack, electronTtsDeleteVoice, electronTtsStream } from '@kitsune/stage-shared'
export const electronTtsStart = defineInvokeEventa<{ success: boolean, message: string }>('eventa:invoke:electron:tts:start')
export const electronTtsStop = defineInvokeEventa<{ success: boolean, message: string }>('eventa:invoke:electron:tts:stop')
// NOTE: the main-process handler returns `getGptSovitsConfig()`, whose data
// directory field is named `dir` (not `dataDir`) — keep the contract aligned.
export const electronTtsGetConfig = defineInvokeEventa<{
  dir: string | null
  port: number | undefined
  device: string | undefined
  threads: number | undefined
}>('eventa:invoke:electron:tts:get-config')
export const electronTtsSetConfig = defineInvokeEventa<
  { needsRestart: boolean },
  { dir?: string, port?: number, device?: 'auto' | 'cpu' | 'cuda' | 'cuda-half', threads?: number }
>('eventa:invoke:electron:tts:set-config')

// 应用配置并自动热加载：停止当前实例 → 用新配置重启 → 轮询就绪 → 返回成功/回滚。
// 与 set-config 的分工：set-config 仅落盘配置并返回 needsRestart 由调用方决定重启时机，
// apply-config 由主进程内部完成整套停止/启动/就绪轮询/失败回滚，仅返回成功与否与诊断消息。
export const electronTtsApplyConfig = defineInvokeEventa<
  { success: boolean, message: string },
  { device?: 'auto' | 'cpu' | 'cuda' | 'cuda-half', threads?: number }
>('eventa:invoke:electron:tts:apply-config')

// 本机能力探测契约 — eventa 为唯一类型所有方，main/system-capabilities.ts 实现 import 此类型，
// renderer 与 main 均通过 shared/eventa 消费，避免重复定义导致字段漂移。
export const electronTtsInstallProgress = defineEventa<{ message: string }>('eventa:event:electron:tts:install-progress')
/** 从本地已解压的引擎目录导入运行时插件（绕过网络下载，支持离线安装）。 */
export const electronTtsInstallPluginFromLocal = defineInvokeEventa<{ success: boolean, message: string, dir?: string }, { sourceDir: string }>('eventa:invoke:electron:tts:install-plugin-from-local')
/** 从本地 ZIP 分卷文件安装运行时插件（绕过网络下载，支持离线安装）。 */
export const electronTtsInstallPluginFromLocalZips = defineInvokeEventa<{ success: boolean, message: string, dir?: string }, { volumesDir: string }>('eventa:invoke:electron:tts:install-plugin-from-local-zips')

/** 获取运行时插件存储根目录（用于设置页展示）。 */
export const electronGetRuntimePluginsDir = defineInvokeEventa<string>('eventa:invoke:electron:runtime-plugins:get-dir')
/** 设置运行时插件存储根目录，自动迁移已安装的插件到新位置。 */
export const electronSetRuntimePluginsDir = defineInvokeEventa<{ ok: boolean, message: string, movedPlugins?: string[] }, { dir: string }>('eventa:invoke:electron:runtime-plugins:set-dir')

// ============================================================================
// ASR — 本地语音识别（sherpa-onnx，SenseVoice/Paraformer/Whisper）
// ============================================================================

/** ASR 转录结果 */
export const electronDialogChooseDirectory = defineInvokeEventa<
  { canceled: boolean, path: string | null },
  { title?: string }
>('eventa:invoke:electron:dialog:choose-directory')

// Dialog — 通用文件选择对话框，支持扩展名过滤（用于 TTS 克隆声线选择音频文件等场景）
export const electronDialogChooseFile = defineInvokeEventa<
  { canceled: boolean, path: string | null },
  { title?: string, extensions?: string[] }
>('eventa:invoke:electron:dialog:choose-file')

// TTS 克隆声线 — 上传音频 + 文本标注，调用 sidecar set_reference_audio 注册自定义声线。
// 注册后即可用 character_name 调用 tts 合成，实现声音克隆。
export const electronTtsCloneVoice = defineInvokeEventa<
  { success: boolean, characterName: string, error?: string },
  { characterName: string, audioPath: string, audioText: string, language?: string }
>('eventa:invoke:electron:tts:clone-voice')

// TTS 删除已克隆声线 — 从 sidecar 已注册角色中移除指定角色（仅支持克隆角色，不能删除预定义角色）。
export const electronTtsRemoveVoice = defineInvokeEventa<
  { success: boolean, error?: string },
  { characterName: string }
>('eventa:invoke:electron:tts:remove-voice')

// Doctor — 内置健康检查（16 大类别诊断 + 自动修复），参考 Hermes Agent CLI doctor 设计
export { electronTtsSynthesize } from '@kitsune/stage-shared'
