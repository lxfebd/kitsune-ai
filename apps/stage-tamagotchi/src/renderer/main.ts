import type { Plugin } from 'vue'
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

createApp(App)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  // NOTICE: autoAnimatePlugin type definitions don't satisfy Vue's Plugin interface;
  // cast at the call site until upstream ships compatible types.
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(PiniaColada)
  .use(i18n)
  .use(Tres)
  .mount('#app')
