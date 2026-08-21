/* eslint-disable no-template-curly-in-string */

import type { Configuration } from 'electron-builder'

import { execSync } from 'node:child_process'

import { isMacOS } from 'std-env'

function hasXcode26OrAbove() {
  if (!isMacOS)
    return false
  try {
    const output = execSync('xcodebuild -version')
      .toString()

      .match(/Xcode (\d+)/)
    if (!output)
      return false
    return Number.parseInt(output[1], 10) >= 26
  }
  catch {
    return false
  }
}

/**
 * Determine whether to use the .icon format for the macOS app icon based on the
 * Xcode version while building.
 * This is friendly to developers whose macOS and/or Xcode versions are below 26.
 */
const useIconFormattedMacAppIcon = hasXcode26OrAbove()
if (!useIconFormattedMacAppIcon) {
  console.warn('[electron-builder/config] Warning: Xcode version is below 26. Using .icns format for macOS app icon.')
}
else {
  // NOTICE: This success-path message intentionally uses stderr via `console.warn`.
  // The artifact metadata CLI imports this config and is used in GitHub Actions
  // command substitution for `GITHUB_ENV`; writing this log to stdout would break
  // machine-readable output such as `BUNDLE_NAME=$(...)`.
  console.warn('[electron-builder/config] Xcode version is 26 or above. Using .icon format for macOS app icon.')
}

export default {
  appId: 'ai.kitsune.desktop',
  productName: 'Kitsune AI',
  directories: {
    output: 'dist',
    buildResources: 'build',
  },
  // // For self-publishing, testing, and distribution after modified the code without access to
  // // an Apple Developer account, comment and uncomment the following lines.
  // // Later on when you obtained one, you can set up the necessary certificates and provisioning
  // // profiles to enable these security features.
  // //
  // // https://www.bigbinary.com/blog/code-sign-notorize-mac-desktop-app
  // // https://kilianvalkhof.com/2019/electron/notarizing-your-electron-application/
  // afterSign: async (context) => {
  //   const { electronPlatformName, appOutDir } = context
  //   if (electronPlatformName !== 'darwin')
  //     return
  //   if (env.CI !== 'true') {
  //     console.warn('Skipping notarizing step. Packaging is not running in CI')
  //     return
  //   }

  //   const appName = context.packager.appInfo.productFilename
  //   await notarize({
  //     appPath: `${appOutDir}/${appName}.app`,
  //     teamId: env.APPLE_DEVELOPER_TEAM_ID!,
  //     appleId: env.APPLE_DEVELOPER_APPLE_ID!,
  //     appleIdPassword: env.APPLE_DEVELOPER_APPLE_APP_SPECIFIC_PASSWORD!,
  //   })
  // },
  files: [
    'out/**',
    'resources/**',
    'package.json',
    // NOTICE: Exclude npm `electron` package from app payload.
    // Electron runtime is already provided by the outer app bundle; bundling a nested
    // `node_modules/electron/dist/Electron.app` makes electron-builder deep-sign it and
    // fails on non-code resources (for example `locale.pak`) with timestamp/signing errors.
    '!**/node_modules/electron{,/**}',
    // NOTICE: Exclude the GPT-SoVITS engine from the install payload. The full engine
    // (incl. bundled Python runtime) is ~6.6GB and would balloon the installer; instead it
    // ships as a runtime plugin downloaded on demand from the GitHub Release to
    // userData/runtime-plugins/tts-gptsovits (see services/kitsune/runtime-plugins).
    '!resources/gpt-sovits{,/**}',
    '!**/.vscode/*',
    '!src/**/*',
    '!**/node_modules/**/{CHANGELOG.md,README.md,README,readme.md,readme}',
    // NOTICE: electron-updater -> builder-util-runtime 依赖 debug，而 debug@4 的入口在 src/ 目录下。
    // 下面的 src 排除规则会误伤它，导致运行时 `Cannot find module 'ms'`/`Cannot find module 'debug'`。
    // 因此显式保留 debug 与 ms 两个模块的 src/，避免安装后启动崩溃。
    '!**/node_modules/**/{.turbo,test,__tests__,tests,example,examples}',
    // debug/ms 在 pnpm 虚拟存储（.pnpm/）下，常规路径匹配不到，需显式按 pnpm 真实路径 include
    '**/node_modules/.pnpm/debug*/node_modules/debug/**/*',
    '**/node_modules/.pnpm/ms*/node_modules/ms/**/*',
    '**/node_modules/debug/**/*',
    '**/node_modules/ms/**/*',
    // NOTICE: koffi 的原生模块（@koromix/koffi-win32-x64）是 koffi 的 optionalDependency，
    // electron-builder 在 pnpm 下不会自动收集 optionalDep，导致运行时 `Cannot find native Koffi`。
    // 显式 include 其 .node 文件并作为 asarUnpack 解压。
    '**/node_modules/.pnpm/@koromix+koffi*/node_modules/@koromix/**/*',
    '**/node_modules/@koromix/**/*',
    // NOTICE: zod-to-json-schema 是 ESM-only 包，electron-builder 在 pnpm 下漏收集。
    // 显式 include 其 node_modules 目录让 electron-builder 跟随 symlink 打包。
    '**/node_modules/zod-to-json-schema/**/*',
    '**/node_modules/superjson/**/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!vite.config.{js,ts,mjs,cjs}',
    '!uno.config.{js,ts,mjs,cjs}',
    '!{.eslintcache,eslint.config.ts,.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json}',
  ],
  asar: true,
  asarUnpack: [
    '**/*.node',
    // NOTICE: koffi 的原生模块（@koromix/koffi-win32-x64）在 pnpm 布局下 electron-builder
    // 不会自动收集 optional dependency，需要显式 include 其 .node 文件才能避免
    // `Cannot find the native Koffi module` 错误。
    '**/node_modules/.pnpm/@koromix+koffi*/node_modules/@koromix/koffi*/**/*.node',
  ],
  extraResources: [
    {
      from: '../../engines/stage-tamagotchi-godot/build/${os}',
      to: 'godot-stage',
      filter: ['**/*'],
    },
    // NOTICE: 原 `resources/gpt-sovits` (GPT-SoVITS + Python runtime, ~6.6GB) 已从安装包移除，
    // 改为运行时插件按需下载（userData/runtime-plugins/tts-gptsovits），见 services/kitsune/runtime-plugins。
    {
      from: '../../resources/models/sherpa-onnx',
      to: 'models/sherpa-onnx',
      filter: ['**/*'],
    },
  ],
  extraMetadata: {
    name: 'ai.kitsune.desktop',
    main: 'out/main/index.js',
    homepage: 'https://github.com/lxfebd/kitsune-ai',
    repository: 'https://github.com/lxfebd/kitsune-ai',
    license: 'MIT',
  },
  win: {
    executableName: 'kitsune-ai',
    // NOTICE: Keep `channel: 'latest-${arch}'` for architecture-aware updater metadata.
    // electron-builder expands `${arch}` at publish-time (for example: `latest-x64`, `latest-arm64`),
    // and electron-updater later consumes that expanded channel to resolve platform-specific *.yml files.
    // This prevents cross-arch lookups such as arm64 clients reading x64 metadata.
    publish: {
      provider: 'github',
      // NOTICE: 配置为你的 GitHub 仓库，格式：owner/repo
      // 例如：owner: 'your-username', repo: 'kitsune-ai'
      owner: 'lxfebd',
      repo: 'kitsune-ai',
      channel: 'latest-${arch}',
    },
  },
  nsis: {
    artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    deleteAppDataOnUninstall: true,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    entitlementsInherit: 'build/entitlements.mac.plist',
    // NOTICE: Same channel rule as Windows. Keep `${arch}` here so generated metadata resolves
    // to architecture-specific update feeds on macOS (for example: `latest-x64-mac.yml`, `latest-arm64-mac.yml`).
    publish: {
      provider: 'github',
      // NOTICE: 配置为你的 GitHub 仓库，格式：owner/repo
      owner: 'lxfebd',
      repo: 'kitsune-ai',
      channel: 'latest-${arch}',
    },
    extendInfo: [
      {
        NSMicrophoneUsageDescription: 'Kitsune AI requires microphone access for voice interaction',
      },
      {
        NSCameraUsageDescription: 'Kitsune AI requires camera access for vision understanding',
      },
    ],
    // For self-publishing, testing, and distribution after modified the code without access to
    // an Apple Developer account, comment and uncomment the following 4 lines.
    // Later on when you obtained one, you can set up the necessary certificates and provisioning
    // profiles to enable these security features.
    // hardenedRuntime: false,
    hardenedRuntime: true,
    // notarize: false,
    notarize: true,
    executableName: 'kitsune-ai',
    icon: useIconFormattedMacAppIcon ? 'icon.icon' : 'icon.icns',
  },
  dmg: {
    artifactName: '${productName}-${version}-darwin-${arch}.${ext}',
  },
  linux: {
    target: [
      'deb',
      'rpm',
    ],
    // NOTICE: Same channel rule as Windows/macOS. Keep `${arch}` to avoid x64/arm64 feed collisions on Linux.
    publish: {
      provider: 'github',
      // NOTICE: 配置为你的 GitHub 仓库，格式：owner/repo
      owner: 'lxfebd',
      repo: 'kitsune-ai',
      channel: 'latest-${arch}',
    },
    category: 'Utility',
    synopsis: 'Kitsune AI - 智能桌面宠物助手',
    description: 'Kitsune AI is an intelligent desktop pet assistant supporting Live2D/VRM avatars, featuring human-like interactions and modular stage-based rendering.',
    executableName: 'kitsune-ai',
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
    icon: 'build/icons/icon.png',
  },
  appImage: {
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
  },
  npmRebuild: false,

} satisfies Configuration
