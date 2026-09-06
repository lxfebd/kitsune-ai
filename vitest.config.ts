import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/ui-admin',
      'apps/stage-tamagotchi',
      'packages/cap-vite',
      'packages/core-agent',
      'packages/core-character',
      'packages/kitsune-emotion-mapper',
      'packages/kitsune-persona',
      'packages/kitsune-tts-hybrid',
      'packages/model-driver-mediapipe',
      'packages/vishot-runner-browser',
      'packages/better-ws',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
    ],
  },
})
