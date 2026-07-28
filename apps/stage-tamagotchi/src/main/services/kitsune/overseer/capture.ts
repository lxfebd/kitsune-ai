import { desktopCapturer, type SourcesOptions } from 'electron'

/** 截屏校验用的缩放参数，与 vision 服务保持一致以保证推理输入分辨率相同 */
const CAPTURE_OPTIONS: SourcesOptions = {
  types: ['screen'],
  thumbnailSize: { width: 1280, height: 720 },
}
const CAPTURE_QUALITY = 0.82

/** 截取第一块屏幕，返回 JPEG data URL；与 vision 服务参数一致 */
export async function captureScreenshot(): Promise<string> {
  const sources = await desktopCapturer.getSources(CAPTURE_OPTIONS)
  const source = sources[0]
  if (!source)
    return ''
  const jpeg = source.thumbnail.toJPEG(CAPTURE_QUALITY)
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}