/**
 * 内置 ASR 引擎注册
 *
 * 在应用启动时注册所有内置引擎到 asr-engine-registry。
 * 引擎配置（模型路径、参数）集中在此，不硬编码在业务代码中。
 *
 * 添加新引擎只需：
 * 1. 在此处调用 registerAsrEngine() 注册
 * 2. 下载对应模型文件到 resources/models/sherpa-onnx/
 * 3. 完成。renderer 侧 Provider 和 hearing store 无需任何修改。
 */

import { registerAsrEngine } from '@kitsune/stage-ui/inference/asr-engine-registry'

/**
 * 注册所有内置 ASR 引擎
 *
 * 模型路径基于 sherpa-onnx 官方预转换包的目录结构：
 * https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
 *
 * 下载后解压到 resources/models/sherpa-onnx/ 即可使用。
 */
export function registerBuiltinAsrEngines(): void {
  // SenseVoice-Small INT8：中文最优，支持情感/事件检测
  // 模型来源：sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17
  // 155MB INT8 量化版，中文 WER ~2%，支持 5 语言
  registerAsrEngine({
    id: 'sensevoice',
    name: 'SenseVoice（本地）',
    type: 'local-onnx',
    recognizerConfig: {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: {
          model: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx',
          language: 'auto',
          useInverseTextNormalization: 1,
        },
        tokens: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/tokens.txt',
        numThreads: 2,
        provider: 'cpu',
      },
      decodingMethod: 'greedy_search',
    },
    defaultLanguage: 'auto',
    supportsEmotion: true,
    supportsEventDetection: true,
  })

  // Paraformer-Small INT8：最快，CTC 架构
  // 模型来源：sherpa-onnx-paraformer-zh-small-2024-03-09
  // 74MB INT8 量化版，中文 WER ~2.8%，超低延迟
  registerAsrEngine({
    id: 'paraformer',
    name: 'Paraformer（本地）',
    type: 'local-onnx',
    recognizerConfig: {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        paraformer: {
          model: 'sherpa-onnx-paraformer-zh-small-2024-03-09/model.int8.onnx',
        },
        tokens: 'sherpa-onnx-paraformer-zh-small-2024-03-09/tokens.txt',
        numThreads: 2,
        provider: 'cpu',
      },
      decodingMethod: 'greedy_search',
    },
    defaultLanguage: 'zh',
    supportsEmotion: false,
    supportsEventDetection: false,
  })
}
