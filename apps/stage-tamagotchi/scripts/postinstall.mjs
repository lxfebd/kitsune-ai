// Stage-tamagotchi 依赖原生模块（uiohook-napi、koffi、sherpa-onnx 等），
// 这些模块只需在本地开发或 electron-builder 打包时针对当前平台从源码重新编译。
// CI（lint/typecheck/test/网页构建）既不打进包里也不会运行这些二进制，
// 直接在安装期强制 rebuild 需要在每个平台额外安装系统头文件（Linux 上的 X11 开发包），
// 徒增失败面与安装耗时。因此 CI 环境下跳过；真实打包由 electron-builder 的 npmRebuild 自动完成。
import { spawnSync } from 'node:child_process'

if (!process.env.CI) {
  spawnSync('electron-builder', ['install-app-deps'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}