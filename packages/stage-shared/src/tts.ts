import { defineInvokeEventa } from '@moeru/eventa'

/** GPT-SoVITS 语音合成 — 通过 sidecar JSON-RPC 进行本地语音合成，返回 ArrayBuffer 供前端播放。 */
export const electronTtsSynthesize = defineInvokeEventa<{ success: boolean, audioData?: ArrayBuffer, error?: string }, { text: string, voice?: string }>('eventa:invoke:electron:tts:synthesize')

/** TTS 声线列表 — 扫描 voices/ 目录动态获取可用声线。 */
export const electronTtsListVoices = defineInvokeEventa<{ voices: Array<{ id: string, name: string, lang: string, is_cloned?: boolean, base_character?: string }> }>('eventa:invoke:electron:tts:list-voices')

/** 导入声线包 — 选择 zip 文件并解压到 voices/ 目录。 */
export const electronTtsImportVoicePack = defineInvokeEventa<
  { success: boolean, voiceId?: string, error?: string },
  { zipPath?: string }
>('eventa:invoke:electron:tts:import-voice-pack')

/** 删除声线 — 从 voices/ 目录移除指定声线。 */
export const electronTtsDeleteVoice = defineInvokeEventa<
  { success: boolean, error?: string },
  { voiceId: string }
>('eventa:invoke:electron:tts:delete-voice')
