import type { WebFontMeta } from '@unocss/preset-web-fonts'
import type { Preset, PresetOrFactoryAwaitable } from 'unocss'

import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'

import { createExternalPackageIconLoader } from '@iconify/utils/lib/loader/external-pkg'
import { presetChromatic } from '@proj-airi/unocss-preset-chromatic'
import { colorToString } from '@unocss/preset-mini/utils'
import { defineConfig, mergeConfigs, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'
import { presetScrollbar } from 'unocss-preset-scrollbar'
import { parseColor } from 'unocss/preset-mini'

// On Netlify, building will result in when fetching metadata and fonts from @unocss/preset-web-fonts plugin:
//
// [cause]: AggregateError [ETIMEDOUT]:
//    at internalConnectMultiple (node:net:1134:18)
//  code: 'ETIMEDOUT',
//  [errors]: [
//    Error: connect ETIMEDOUT 146.75.77.229:443 ...
//    Error: connect ENETUNREACH 2a04:4e42:83::485:443 - Local (:::0) ...
//  ]
//
// This is same for either Google Fonts or Fontsource as provider. But GitHub Actions and local development works fine.
// My assumption is that the default timeout for auto-selecting family is too short (250ms)[^1] for the implementation
// of the Happy Eyeballs algorithm in Node.js, which is used by the `net` module to connect to the server, workflows
// illustrates like this:
//
// lookupAndConnect > autoSelectFamilyAttemptTimeout > lookupAndConnectMultiple > internalConnectMultiple > defaultTriggerAsyncIdScope
//
// Such mechanism will be used when the `net` module attempts to connect to a server using both IPv4 and IPv6 addresses,
// which is the case for Netlify builder.
//
// In order to fix this issue, we can increase the timeout to 1000ms (1 second) so that the algorithm has more time to
// attempt to connect to the server before timing out.
//
// [^1]: https://github.com/nodejs/node/pull/44731/files#diff-d76469e9e7f555294a7a5488c5c8fc4ef8ce5aea448cc26a1322d1ab693e09caR921
setDefaultAutoSelectFamilyAttemptTimeout(1000)

export function presetStoryMockHover(): PresetOrFactoryAwaitable {
  return {
    name: 'story-mock-hover',
    variants: [
      (matcher) => {
        if (!matcher.includes('hover')) {
          return matcher
        }

        return {
          matcher,
          selector: (s) => {
            return `${s}, ${s.replace(/:hover$/, '')}._hover`
          },
        }
      },
    ],
  }
}

export function safelistAllPrimaryBackgrounds(): string[] {
  return [undefined, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => {
    const prefix = shade ? `bg-primary-${shade}` : `bg-primary`
    return [
      prefix,
      ...[5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(opacity => `${prefix}/${opacity}`),
    ]
  }).flat()
}

export function presetWebFontsFonts(provider: 'fontsource' | 'none'): Record<string, string | WebFontMeta | (string | WebFontMeta)[]> {
  return {
    'sans': {
      name: provider === 'fontsource' ? 'DM Sans' : 'DM Sans Variable',
      provider,
    },
    'serif': {
      name: 'DM Serif Display',
      provider,
    },
    'mono': {
      name: 'DM Mono',
      provider,
    },
    'cutejp': {
      name: 'Kiwi Maru',
      provider,
      subsets: ['latin', 'japanese'],
    },
    'cuteen': {
      name: provider === 'fontsource' ? 'Nunito' : 'Nunito Variable',
      provider,
    },
    'jura': {
      name: provider === 'fontsource' ? 'Jura' : 'Jura Variable',
      provider,
    },
    'gugi': {
      name: 'Gugi',
      provider,
    },
    'quicksand': {
      name: provider === 'fontsource' ? 'Quicksand' : 'Quicksand Variable',
      provider,
    },
    'urbanist': {
      name: provider === 'fontsource' ? 'Urbanist' : 'Urbanist Variable',
      provider,
    },
    'comfortaa': {
      name: provider === 'fontsource' ? 'Comfortaa' : 'Comfortaa Variable',
      provider,
    },
    'm-plus-rounded': {
      name: 'M PLUS Rounded 1c',
      provider,
    },
    'quanlai': {
      name: 'cjkfonts AllSeto',
      provider: 'none',
    },
    'xiaolai': {
      name: 'Xiaolai SC',
      provider: 'none',
    },
  }
}

export function sharedUnoConfig() {
  return defineConfig({
    presets: [
      presetWind3(),
      presetAttributify(),
      presetTypography(),
      presetIcons({
        scale: 1.2,
        collections: {
          ...createExternalPackageIconLoader('@proj-airi/lobe-icons'),
          ...createExternalPackageIconLoader('@proj-airi/iconify-meteocons'),
          // 本地 Iconify 集合：离线打包，避免运行时依赖在线 API(api.iconify.design)。
          // 这些集合已作为 @kitsune/stage-tamagotchi 依赖安装(见 apps/stage-tamagotchi/package.json)。
          ...createExternalPackageIconLoader('@iconify-json/solar'),
          ...createExternalPackageIconLoader('@iconify-json/ph'),
          ...createExternalPackageIconLoader('@iconify-json/simple-icons'),
          ...createExternalPackageIconLoader('@iconify-json/vscode-icons'),
          ...createExternalPackageIconLoader('@iconify-json/carbon'),
          ...createExternalPackageIconLoader('@iconify-json/eos-icons'),
          ...createExternalPackageIconLoader('@iconify-json/lucide'),
          ...createExternalPackageIconLoader('@iconify-json/mingcute'),
          ...createExternalPackageIconLoader('@iconify-json/svg-spinners'),
        },
      }),
      presetScrollbar(),
      presetChromatic({
        baseHue: 345,
        colors: {
          primary: 0,
        },
      }) as Preset,
    ],
    transformers: [
      transformerDirectives({
        applyVariable: ['--at-apply'],
      }),
      transformerVariantGroup(),
    ],
    safelist: [
      ...'prose prose-sm m-auto text-left'.split(' '),
      ...safelistAllPrimaryBackgrounds(),
      // 控制岛与设置侧边栏图标，确保动态/条件类能被 UnoCSS 生成
      'i-solar:settings-minimalistic-outline',
      'i-solar:emoji-funny-square-broken',
      'i-solar:chat-line-line-duotone',
      'i-solar:refresh-linear',
      'i-solar:moon-outline',
      'i-solar:sun-2-outline',
      'i-solar:pin-bold',
      'i-solar:pin-linear',
      'i-solar:close-circle-outline',
      'i-solar:alt-arrow-up-line-duotone',
      'i-ph:microphone-slash',
      'i-ph:arrows-out-cardinal',
      'i-solar:settings-bold-duotone',
      'i-solar:cpu-bolt-bold-duotone',
      'i-solar:microphone-bold-duotone',
      'i-solar:microphone-3-bold-duotone',
      'i-solar:database-bold-duotone',
      'i-solar:widget-bold-duotone',
      'i-solar:people-nearby-bold-duotone',
      'i-solar:close-circle-bold-duotone',
      // 模块列表图标
      'i-solar:ghost-bold-duotone',
      'i-solar:user-speak-rounded-bold-duotone',
      'i-solar:microphone-3-bold-duotone',
      'i-solar:eye-closed-bold-duotone',
      'i-solar:palette-bold-duotone',
      'i-solar:bookmark-bold-duotone',
      'i-solar:book-bookmark-bold-duotone',
      'i-simple-icons:discord',
      'i-simple-icons:x',
      'i-vscode-icons:file-type-minecraft',
      'i-solar:server-bold-duotone',
      'i-solar:music-notes-bold-duotone',
      // 环境适配中心 — 桌面自动化图标
      'i-solar:stethoscope-bold-duotone',
      'i-solar:wrench-bold-duotone',
      'i-solar:logout-3-bold-duotone',
      'i-solar:pen-2-bold-duotone',
      'i-solar:diskette-bold-duotone',
      'i-solar:check-circle-bold-duotone',
      'i-solar:trash-bin-2-bold-duotone',
      'i-solar:close-circle-bold-duotone',
      'i-solar:play-bold-duotone',
      'i-solar:stop-bold-duotone',
      'i-solar:list-check-bold-duotone',
      'i-solar:mouse-bold-duotone',
      'i-solar:cursor-bold-duotone',
      'i-solar:target-bold-duotone',
      'i-solar:gallery-bold-duotone',
      'i-solar:keyboard-bold-duotone',
      'i-solar:heart-bold',
    ],
    // hyoban/unocss-preset-shadcn: Use shadcn ui with UnoCSS
    // https://github.com/hyoban/unocss-preset-shadcn
    //
    // Thanks to
    // https://github.com/unovue/shadcn-vue/issues/34#issuecomment-2467318118
    // https://github.com/hyoban-template/shadcn-vue-unocss-starter
    //
    // By default, `.ts` and `.js` files are NOT extracted.
    // If you want to extract them, use the following configuration.
    // It's necessary to add the following configuration if you use shadcn-vue or shadcn-svelte.
    content: {
      pipeline: {
        include: [
          // the default

          /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
          // include js/ts files
          '(components|src)/**/*.{js,ts,vue}', // THIS CAN INCLUDE node_modules
          '**/stage-ui/**/*.{vue,js,ts}', // THIS TOO
          '**/ui/**/*.{vue,js,ts}', // THIS TOO
        ],
        exclude: [

          /\/node_modules\//, // DO NOT SCAN THE BLACK HOLE
        ],
      },
    },
    rules: [

      [/^mask-\[(.*)\]$/, ([, suffix]) => ({ '-webkit-mask-image': suffix.replace(/_/g, ' ') })],

      [/^bg-dotted-\[(.*)\]$/, ([, color], { theme }) => {
        const parsedColor = parseColor(color, theme)
        // Util usage: https://github.com/unocss/unocss/blob/f57ef6ae50006a92f444738e50f3601c0d1121f2/packages-presets/preset-mini/src/_utils/utilities.ts#L186
        return {
          'background-image': `radial-gradient(circle at 1px 1px, ${colorToString(parsedColor?.cssColor ?? parsedColor?.color ?? color, 'var(--un-background-opacity)')} 1px, transparent 0)`,
          '--un-background-opacity': parsedColor?.cssColor?.alpha ?? parsedColor?.alpha ?? 1,
        }
      }],

      [/drag-region/, () => ({ 'app-region': 'drag' })],
    ],
    // Settings 页面统一 token:所有 settings 子页面共用同一套卡片样式,
    // 避免各页面各自定义 PANEL/CARD 常量导致参数漂移。
    // 基线取自 environment 子面板(glassmorphism),收敛 general/bar/icon-item 等历史样式。
    // 圆角与密度由 CSS 变量驱动(见 appearance store + App.vue watcher),
    // 用户在 System > General 的"界面外观"区可实时调整。
    shortcuts: {
      // NOTICE: padding 使用 calc(var(--settings-density-scale, 1) * 1rem) 形式,
      // 这样密度档位(compact/normal/comfortable)会等比缩放内边距,保持节奏一致。
      // 圆角用 var(--settings-card-radius, 1rem),与 settings-card 形成层级。
      'settings-panel': 'flex flex-col border border-black/[0.06] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.04] backdrop-blur-2xl',
      'settings-card': 'flex flex-col border border-black/[0.06] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]',
      'settings-page-header': 'flex items-center justify-between gap-2 flex-wrap mb-1',
      'settings-page-title': 'text-sm font-semibold text-neutral-900 dark:text-neutral-100',
      'settings-page-description': 'text-xs text-neutral-500 dark:text-neutral-400',
    },
    theme: {
      fontFamily: {
        'sans': `"DM Sans Variant", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
        'sans-rounded': `"Comfortaa Variable", "Comfortaa", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
        'cute': `"Nunito Variable", "Nunito", "ChillRoundM", "Kiwi Maru", "Comfortaa Variable", "Comfortaa", "DM Sans Variant", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
        'cuteen': `"Nunito Variable", "Nunito", "ChillRoundM", "Kiwi Maru", "Comfortaa Variable", "Comfortaa", "DM Sans Variant", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
        'cutejp': `"Nunito Variable", "Nunito", "ChillRoundM", "Kiwi Maru", "Comfortaa Variable", "Comfortaa", "DM Sans Variant", "DM Sans", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";`,
      },
      /**
       * https://github.com/unocss/unocss/blob/1031312057a3bea1082b7d938eb2ad640f57613a/packages-presets/preset-wind4/src/theme/animate.ts
       * https://unocss.dev/presets/wind4#transformdirectives
       */
      animation: {
        keyframes: {
          overlayShow: '{from{opacity:0;}to{opacity:1;}}',
          overlayHide: '{from{opacity:1;}to{opacity:0;}}',
          contentShow: '{from:{opacity:0;transform:translate(-50%,-48%) scale(0.96);}to:{opacity:1;transform:translate(-50%,-50%) scale(1);}}',
          contentHide: '{from:{opacity:1;transform:translate(-50%,-50%) scale(1);}to:{opacity:0;transform:translate(-50%,-48%) scale(0.96);}}',
          slideUpAndFade: '{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}',
          slideRightAndFade: '{from{opacity:0;transform:translateX(-2px)}to{opacity:1;transform:translateX(0)}}',
          slideDownAndFade: '{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:translateY(0)}}',
          slideLeftAndFade: '{from{opacity:0;transform:translateX(2px)}to{opacity:1;transform:translateX(0)}}',
          fadeIn: '{from{opacity:0;}to{opacity:1;}}',
          fadeOut: '{from{opacity:1;}to{opacity:0;}}',
        },
        durations: {
          overlayShow: '300ms',
          overlayHide: '300ms',
          contentShow: '150ms',
          contentHide: '150ms',
          slideUpAndFade: '400ms',
          slideRightAndFade: '400ms',
          slideDownAndFade: '400ms',
          slideLeftAndFade: '400ms',
          fadeIn: '200ms',
          fadeOut: '200ms',
        },
        timingFns: {
          overlayShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
          overlayHide: 'cubic-bezier(0.16, 1, 0.3, 1)',
          contentShow: 'cubic-bezier(0.16, 1, 0.3, 1)',
          contentHide: 'cubic-bezier(0.16, 1, 0.3, 1)',
          slideUpAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
          slideRightAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
          slideDownAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
          slideLeftAndFade: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fadeIn: 'ease-in-out',
          fadeOut: 'ease-in-out',
        },
      },
    },
  })
}

export function histoireUnoConfig() {
  return defineConfig({
    presets: [
      presetStoryMockHover(),
    ],
  })
}

export default mergeConfigs([
  sharedUnoConfig(),
  histoireUnoConfig(),
])
