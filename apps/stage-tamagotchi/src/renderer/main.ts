import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { PiniaColada } from '@pinia/colada'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'

import App from './App.vue'

import { i18n } from './modules/i18n'

import '@unocss/reset/tailwind.css'
import 'splitpanes/dist/splitpanes.css'
import 'vue-sonner/style.css'
import './styles/main.css'
import 'uno.css'
// Core font (loaded at startup)
import '@fontsource-variable/dm-sans/index.css'
// Additional fonts (loaded after first paint)
requestIdleCallback(() => {
  import('@fontsource-variable/nunito/index.css')
  import('@kitsune/font-cjkfonts-allseto/index.css')
  import('@kitsune/font-xiaolai/index.css')
  import('@fontsource-variable/jura/index.css')
  import('@fontsource-variable/quicksand/index.css')
  import('@fontsource-variable/urbanist/index.css')
  import('@fontsource-variable/comfortaa/index.css')
  import('@fontsource/dm-mono/index.css')
  import('@fontsource/dm-serif-display/index.css')
  import('@fontsource/gugi/index.css')
  import('@fontsource/kiwi-maru/index.css')
  import('@fontsource/m-plus-rounded-1c/index.css')
})

const pinia = createPinia()

const router = createRouter({
  history: createWebHashHistory(),
  // TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
  routes: setupLayouts(routes as RouteRecordRaw[]),
})

// 旧深链兜底：executor/overseer/account 设置页已收敛（内容并入流水线），
// 老链接不再生成路由，重定向防止落空页白屏。
const DEPRECATED_SETTINGS_REDIRECTS: Array<[RegExp, string]> = [
  [/^\/settings\/executor(?:\/.*)?$/, '/settings/pipeline?stage=work'],
  [/^\/settings\/overseer(?:\/.*)?$/, '/settings/pipeline?stage=monitor'],
  [/^\/settings\/account(?:\/.*)?$/, '/settings'],
]
router.beforeEach((to) => {
  for (const [pattern, replacement] of DEPRECATED_SETTINGS_REDIRECTS) {
    if (pattern.test(to.path))
      return { path: replacement, replace: true }
  }
})

createApp(App)
  .use(MotionPlugin)
  .use(autoAnimatePlugin)
  .use(router)
  .use(pinia)
  .use(PiniaColada)
  .use(i18n)
  .use(Tres)
  .mount('#app')
