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
    '!**/.vscode/*',
    '!src/**/*',
    '!**/node_modules/**/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/**/{.turbo,test,src,__tests__,tests,example,examples}',
    '**/node_modules/debug/**/*',
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
  ],
  extraResources: [
    {
      from: '../../engines/stage-tamagotchi-godot/build/${os}',
      to: 'godot-stage',
      filter: ['**/*'],
    },
    {
      from: 'resources/gpt-sovits',
      to: 'gpt-sovits',
      filter: ['**/*', '!pretrained_models/**', '!__pycache__/**', '!*.pyc', '!_tier*_backup/**'],
    },
    // ASR 模型：SenseVoice-Small + Paraformer-Small
    // 首次使用前需运行 scripts/download-asr-models.ps1 下载
    {
      from: '../../resources/models/sherpa-onnx',
      to: 'models/sherpa-onnx',
      filter: ['**/*'],
    },
  ],
  extraMetadata: {
    name: 'ai.kitsune.desktop',
    main: 'out/main/index.js',
    homepage: '',
    repository: '',
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
      owner: '',
      repo: '',
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
      owner: '',
      repo: '',
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
      owner: '',
      repo: '',
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
