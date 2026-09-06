import { copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { Plugin } from 'vite'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import templateCompilerOptions from '@tresjs/core/template-compiler-options'
import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import Yaml from 'unplugin-yaml/vite'
import Inspect from 'vite-plugin-inspect'
import VitePluginVueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import VueMacros from 'vue-macros/vite'
import VueRouter from 'vue-router/vite'

import { Download } from '@proj-airi/unplugin-fetch'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { defineConfig } from 'electron-vite'

const stageUIAssetsRoot = resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'assets'))
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache'))

const live2dModelFiles = ['hiyori_pro_zh.zip', 'hiyori_free_zh.zip']
const live2dModelsDir = join(stageUIAssetsRoot, 'live2d', 'models')

// Copy built-in Live2D zip models to the renderer output in production builds.
// In dev mode, the main-process file server (live2d-file-server.ts) serves them instead.
function live2dModelsPlugin(): Plugin {
  return {
    name: 'proj-kitsune:live2d-models',
    writeBundle(options) {
      const outDir = options.dir ?? resolve(join(import.meta.dirname, 'out', 'renderer'))
      const targetDir = join(outDir, 'live2d', 'models')
      mkdirSync(targetDir, { recursive: true })
      for (const fileName of live2dModelFiles) {
        copyFileSync(join(live2dModelsDir, fileName), join(targetDir, fileName))
      }
    },
  }
}

export default defineConfig({
  main: {
    build: {
      // 额外入口：petMcpServerChild 是宿主 spawn 的独立子进程，
      // 不被 main/index.ts 引用，需显式列为入口才能打进 out/main/。
      rollupOptions: {
        input: {
          index: resolve(join(import.meta.dirname, 'src', 'main', 'index.ts')),
          petMcpServerChild: resolve(join(import.meta.dirname, 'src', 'main', 'services', 'kitsune', 'petMcpServerChild.ts')),
        },
        // electron 包在运行时由 electron 二进制注入 app/BrowserWindow 等 API，
        // 其 index.js 仅作为 Node.js 端解析 exe 路径的 shim（module.exports = path 字符串）。
        // bundler 一旦把它 inline 成 CJS chunk，__dirname 错位 → getElectronPath 失败；
        // 即使路径对了，module.exports=字符串 也会被 ESM interop 包成 {default: '...'}，
        // 导致 require('electron').app 拿到 undefined。
        // 必须 external 保留为运行时由 electron 自身 hook 的虚拟模块。
        //
        // koffi / sherpa-onnx-node / 原生 N-API 模块同理：被 inline 后 .node 加载失败
        // 或 .proto()/.func()/.load() 调用 stub → "Cannot find the native Koffi module" /
        // "koffi.load is not a function" / "wasmModule._SherpaOnnxGetVersionStr is not a function"。
        external: [
          'electron',
          // electron-updater 重依赖树（node-forge/fs-extra/js-yaml/builder-util-runtime/semver 等）
          // 约 1.3MB，原本被误并入 is-desktop-overlay-enabled 共享 chunk 并在主进程启动期加载。
          // external 后运行期从 node_modules 加载（需为 dependencies，见 package.json）。
          'electron-updater',
          // mkcert 依赖 node-forge(~700KB)，被 channel-server 用于生成本地 CA 证书。
          // 原误并入 is-desktop-overlay-enabled 共享 chunk 并在主进程启动期加载。
          // external 后运行期从 node_modules 加载（需为 dependencies，见 package.json）。
          'mkcert',
          'electron-click-drag-plugin',
          'uiohook-napi',
          'koffi',
          'sherpa-onnx',
          'sherpa-onnx-node',
          'sherpa-onnx-wasm',
          'onnxruntime-node',
          'onnxruntime-web',
          'zod-to-json-schema',
          '@modelcontextprotocol/sdk',
          'fsevents',
        ],
      },
      externalizeDeps: {
        include: [
          // Native modules that have `__dirname` usages. Externalize to avoid bundling
          // them into ESM and causing issues in runtime.
          'electron-click-drag-plugin',
          'uiohook-napi',
          // 'electron' 的 index.js 用 __dirname/path.txt 解析 dist/electron.exe。
          // 一旦被 inline 进 main chunk，__dirname 指向 out/main/chunks/，
          // path.txt 不存在 → getElectronPath() 抛 "Electron failed to install correctly"。
          // externalize 后运行时走真实 node_modules/electron/index.js。
          'electron',
          // petMcpServerChild 入口引入的运行时依赖，externalize 以免 main build 无法解析
          'zod-to-json-schema',
          '@modelcontextprotocol/sdk',
        ],
        exclude: [
          // Workspace TS packages that need to be bundled (not externalized)
          // because they ship .ts source without a build step.
          '@kitsune/persona',
          '@kitsune/emotion-mapper',
          '@kitsune/core-character',
          '@kitsune/tts-hybrid',
        ],
      },
    },
    plugins: [
      {
        // To replace `build.rolldownOptions`, as electron-vite still uses the deprecated
        // `rollupOptions`, using `rollupOptions` and `rolldownOptions` at the same
        // time may lead to unexpected merge results. Using `rollupOptions` to manipulate
        // `manualChunks` also did not work. Therefore, it was transformed into a plugin
        // declaration with the recommended `codeSplitting` option.
        name: 'manual-chunks',
        outputOptions(options) {
          options.codeSplitting = {
            groups: [
              {
                name(moduleId) {
                  // https://github.com/lobehub/lobehub/blob/6ecba929b738e1259e15d17e7643941e015324ee/apps/desktop/electron.vite.config.ts#L54
                  // Prevent debug package from being bundled into index.js to avoid side-effect pollution
                  if (moduleId.includes('node_modules/debug')) {
                    return 'vendor-debug'
                  }
                },
              },
              {
                name(moduleId) {
                  // https://github.com/lobehub/lobehub/blob/6ecba929b738e1259e15d17e7643941e015324ee/apps/desktop/electron.vite.config.ts#L54
                  // Prevent debug package from being bundled into index.js to avoid side-effect pollution
                  if (moduleId.includes('node_modules/h3')) {
                    return 'vendor-h3'
                  }
                },
              },
            ],
          }

          return options
        },
      },
      Info(),
      // main (ssr) build 也会打包 @kitsune/i18n 源码（alias 指向 packages/i18n/src），
      // 其 `import x from './x.yaml'` 需要 yaml 解析能力，否则报 PARSE_ERROR。
      // 与 renderer 段保持一致接入 unplugin-yaml。
      Yaml(),
    ],

    resolve: {
      alias: {
        '@kitsune/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
        '@kitsune/server-runtime/server': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-runtime', 'src', 'server', 'index.ts')),
        '@kitsune/server-runtime': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-runtime', 'src', 'index.ts')),
      },
    },
  },

  preload: {
    build: {
      lib: {
        entry: {
          'index': resolve(join(import.meta.dirname, 'src', 'preload', 'index.ts')),
          'beat-sync': resolve(join(import.meta.dirname, 'src', 'preload', 'beat-sync.ts')),
        },
      },
    },

    plugins: [],
  },

  renderer: {
    // Thanks to [@Maqsyo](https://github.com/Maqsyo)
    // https://github.com/alex8088/electron-vite/issues/99#issuecomment-1862671727
    base: './',

    build: {
      rolldownOptions: {
        input: {
          'main': resolve(join(import.meta.dirname, 'src', 'renderer', 'index.html')),
          'beat-sync': resolve(join(import.meta.dirname, 'src', 'renderer', 'beat-sync.html')),
        },
      },
    },

    optimizeDeps: {
      exclude: [
        // Internal Packages
        '@kitsune/stage-ui/*',
        '@proj-airi/drizzle-duckdb-wasm',
        '@proj-airi/drizzle-duckdb-wasm/*',
        '@kitsune/electron-screen-capture',

        // Static Assets: Models, Images, etc.
        'src/renderer/public/assets/*',

        // Live2D SDK
        '@framework/live2dcubismframework',
        '@framework/math/cubismmatrix44',
        '@framework/type/csmvector',
        '@framework/math/cubismviewmatrix',
        '@framework/cubismdefaultparameterid',
        '@framework/cubismmodelsettingjson',
        '@framework/effect/cubismbreath',
        '@framework/effect/cubismeyeblink',
        '@framework/model/cubismusermodel',
        '@framework/motion/acubismmotion',
        '@framework/motion/cubismmotionqueuemanager',
        '@framework/type/csmmap',
        '@framework/utils/cubismdebug',
        '@framework/model/cubismmoc',
      ],
    },

    resolve: {
      alias: {
        '@kitsune/server-sdk': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-sdk', 'src')),
        '@kitsune/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
        // NOTICE: the @kitsune/stage-ui alias resolves to a directory; rolldown
        // concatenates sub-paths without a file extension, so bare .ts files at the
        // stores/ root (e.g. mcp-tool-bridge.ts) are not found.  Add explicit aliases
        // for each such file that the renderer imports from @kitsune/stage-ui.
        '@kitsune/stage-ui/stores/mcp-tool-bridge': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'stores', 'mcp-tool-bridge.ts')),
        '@kitsune/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
        '@kitsune/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
        '@kitsune/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
      },
    },

    server: {
      fs: {
        // To mute errors like:
        //   The request id ".../node_modules/@fontsource/sniglet/files/sniglet-latin-400-normal.woff" is outside of Vite serving allow list.
        //
        // See: https://vite.dev/config/server-options#server-fs-strict
        strict: false,
      },
      // unplugin-vue-router 生成的类型文件位于 src/renderer/ 下，默认会被 Vite watcher 监视，
      // 其内容变化会反复触发 vue-router/auto-routes 热更新，形成 HMR 死循环。
      watch: {
        ignored: ['**/typed-router.d.ts'],
      },
      warmup: {
        clientFiles: [
          `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src'))}/*.vue`,
          `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src'))}/*.vue`,
        ],
      },
    },

    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          inlineDynamicImports: false,
        },
      },
    },

    plugins: [
      Info(),

      {
        name: 'proj-kitsune:defines',
        config(ctx) {
          const define: Record<string, any> = {
            'import.meta.env.RUNTIME_ENVIRONMENT': '\'electron\'',
          }
          if (ctx.mode === 'development') {
            define['import.meta.env.URL_MODE'] = '\'server\''
          }
          if (ctx.mode === 'production') {
            define['import.meta.env.URL_MODE'] = '\'file\''
          }

          return { define }
        },
      },

      Inspect(),

      Yaml(),

      VueMacros({
        plugins: {
          vue: Vue({
            include: [/\.vue$/, /\.md$/],
            ...templateCompilerOptions,
          }),
          vueJsx: false,
        },
        betterDefine: false,
      }),

      VueRouter({
        dts: resolve(import.meta.dirname, 'src/renderer/typed-router.d.ts'),
        routesFolder: [
          {
            src: resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
            exclude: base => [
              ...base,
              '**/devtools/index.vue',
              '**/settings/modules/mcp.vue',
              '**/settings/modules/memory-long-term.vue',
              '**/settings/modules/memory-short-term.vue',
            ],
          },
          {
            src: resolve(import.meta.dirname, 'src', 'renderer', 'pages'),
            exclude: base => [
              ...base,
              '**/settings/connection/**',
              '**/settings/data/**',
              '**/settings/models/**',
              '**/settings/system/general.vue',
              '**/settings/index.vue',
            ],
          },
        ],
        exclude: ['**/components/**'],
      }),

      VitePluginVueDevTools(),

      // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
      Layouts({
        layoutsDirs: [
          resolve(import.meta.dirname, 'src', 'renderer', 'layouts'),
          resolve(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src', 'layouts'),
        ],
        pagesDirs: [
          resolve(import.meta.dirname, 'src', 'renderer', 'pages'),
          resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
        ],
      }),

      UnoCss(),

      // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
      VueI18n({
        runtimeOnly: true,
        compositionOnly: true,
        fullInstall: true,
      }),

      live2dModelsPlugin(),

      // DownloadLive2DSDK(),
      // TODO: 待资源源确定后更新
      // Download('https://assets.kitsune.ai/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      // Download('https://assets.kitsune.ai/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      // Download('https://assets.kitsune.ai/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'vrm/models/AvatarSample-A', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      // Download('https://assets.kitsune.ai/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'vrm/models/AvatarSample-B', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
    ],
  },
})
