import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  noExternal: [
    '@kitsune/font-cjkfonts-allseto',
    '@kitsune/font-departure-mono',
    '@kitsune/font-xiaolai',
  ],
  dts: true,
  sourcemap: true,
})
