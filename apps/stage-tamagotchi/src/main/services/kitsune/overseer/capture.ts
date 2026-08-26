import { desktopCapturer, type SourcesOptions } from 'electron'
import { errorMessageFrom } from '@moeru/std'

/** 截屏校验用的缩放参数，与 vision 服务保持一致以保证推理输入分辨率相同 */
const CAPTURE_OPTIONS: SourcesOptions = {
  types: ['screen'],
  thumbnailSize: { width: 1280, height: 720 },
}
const CAPTURE_QUALITY = 0.82

/**
 * 截取第一块屏幕，返回 JPEG data URL；与 vision 服务参数一致。
 *
 * 失败时抛出带原因的 Error，让调用方（desktop-automation IPC handler）
 * 能把真实错误透传到渲染层，而非静默返回空字符串让工具误以为"成功但无图"。
 */
export async function captureScreenshot(): Promise<string> {
  let sources
  try {
    sources = await desktopCapturer.getSources(CAPTURE_OPTIONS)
  }
  catch (error) {
    throw new Error(`截图失败：${errorMessageFrom(error) ?? 'desktopCapturer 不可用'}`)
  }
  const source = sources[0]
  if (!source)
    throw new Error('截图失败：未找到可用的屏幕源（可能缺少屏幕捕获权限）')
  const jpeg = source.thumbnail.toJPEG(CAPTURE_QUALITY)
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}