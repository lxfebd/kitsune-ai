import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// electron 在 vitest 环境不可用，mock 掉 app（isPackaged=false + 固定 userData）
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/fake/userData' },
}))

// createConfig 走内存 Map，与 tts/comfyui 测试同款
const { configStoreMap } = vi.hoisted(() => ({ configStoreMap: new Map<string, unknown>() }))

vi.mock('../../../libs/electron/persistence', () => ({
  createConfig: (namespace: string, filename: string, _schema: unknown, options?: { default?: unknown }) => {
    const key = `${namespace}:${filename}`
    configStoreMap.set(key, options?.default !== undefined ? { ...options.default } : undefined)
    return {
      setup: () => ({ status: 'ok' as const, path: '', value: configStoreMap.get(key) }),
      setupAsync: async () => ({ status: 'ok' as const, path: '', value: configStoreMap.get(key) }),
      get: () => configStoreMap.get(key),
      update: (data: unknown) => { configStoreMap.set(key, data) },
      getDiagnostics: () => undefined,
    }
  },
}))

describe('runtime-plugins', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rtplugin-test-'))
    vi.resetModules()
    configStoreMap.clear()
    delete process.env.KITSUNE_RUNTIME_PLUGINS_DIR
    delete process.env.KITSUNE_SKIP_RUNTIME_PLUGIN
  })

  afterEach(() => {
    delete process.env.KITSUNE_RUNTIME_PLUGINS_DIR
    delete process.env.KITSUNE_SKIP_RUNTIME_PLUGIN
    rmSync(root, { recursive: true, force: true })
  })

  async function load() {
    return await import('./index')
  }

  describe('根目录优先级', () => {
    it('环境变量 > 默认 userData', async () => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = join(root, 'env-root')
      mkdirSync(process.env.KITSUNE_RUNTIME_PLUGINS_DIR, { recursive: true })

      const { getRuntimePluginsDir } = await load()
      expect(getRuntimePluginsDir()).toBe(process.env.KITSUNE_RUNTIME_PLUGINS_DIR)
    })

    it('持久化配置 > 环境变量', async () => {
      const cfgDir = join(root, 'cfg-root')
      mkdirSync(cfgDir, { recursive: true })
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = join(root, 'env-root')

      const { getRuntimePluginsDir } = await load()
      // createConfig mock 在模块加载时把 key 重置为 default(undefined)，
      // 因此须在 load 之后再设置持久化配置。
      configStoreMap.set('runtime-plugins:config.json', { dir: cfgDir })

      expect(getRuntimePluginsDir()).toBe(cfgDir)
    })

    it('默认 userData/runtime-plugins', async () => {
      const { getRuntimePluginsDir } = await load()
      expect(getRuntimePluginsDir()).toBe(join('/fake/userData', 'runtime-plugins'))
    })
  })

  describe('isPluginInstalled / resolvePluginRoot', () => {
    function makePlugin(id: string, version: string): string {
      const dir = join(root, id)
      mkdirSync(join(dir, 'weights'), { recursive: true })
      writeFileSync(join(dir, 'weights', 'gpt.ckpt'), 'model')
      writeFileSync(join(dir, '.plugin.json'), JSON.stringify({ id, version, installedAt: new Date().toISOString() }), 'utf-8')
      return dir
    }

    beforeEach(() => {
      // 让插件根指向测试目录
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = root
    })

    it('标记存在且版本匹配 → 已安装', async () => {
      const pluginDir = makePlugin('tts-gptsovits', '1.0.0')
      const { isPluginInstalled, resolvePluginRoot } = await load()

      expect(isPluginInstalled('tts-gptsovits', '1.0.0')).toBe(true)
      expect(resolvePluginRoot('tts-gptsovits')).toBe(pluginDir)
    })

    it('版本不匹配 → 未安装', async () => {
      makePlugin('tts-gptsovits', '0.9.9')
      const { isPluginInstalled } = await load()

      expect(isPluginInstalled('tts-gptsovits', '1.0.0')).toBe(false)
    })

    it('标记损坏 / id 不符 / 缺失 → 未安装', async () => {
      // 损坏的 JSON
      const broken = join(root, 'tts-gptsovits')
      mkdirSync(broken, { recursive: true })
      writeFileSync(join(broken, '.plugin.json'), 'not-json', 'utf-8')
      const { isPluginInstalled } = await load()
      expect(isPluginInstalled('tts-gptsovits')).toBe(false)

      // 无标记目录
      const bare = join(root, 'asr-sherpa')
      mkdirSync(bare, { recursive: true })
      expect(isPluginInstalled('asr-sherpa')).toBe(false)

      // id 不符
      writeFileSync(join(bare, '.plugin.json'), JSON.stringify({ id: 'other', version: '1.0.0' }), 'utf-8')
      expect(isPluginInstalled('asr-sherpa')).toBe(false)
    })

    it('开发期 KITSUNE_SKIP_RUNTIME_PLUGIN 跳过检查', async () => {
      process.env.KITSUNE_SKIP_RUNTIME_PLUGIN = '1'
      const { isPluginInstalled } = await load()
      expect(isPluginInstalled('tts-gptsovits')).toBe(true)
    })
  })

  describe('setRuntimePluginsDir 迁移', () => {
    beforeEach(() => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = join(root, 'src-root')
    })

    it('迁移已安装插件到新目录并删除旧目录', async () => {
      const srcRoot = process.env.KITSUNE_RUNTIME_PLUGINS_DIR!
      mkdirSync(join(srcRoot, 'tts-gptsovits', 'weights'), { recursive: true })
      writeFileSync(join(srcRoot, 'tts-gptsovits', '.plugin.json'), JSON.stringify({ id: 'tts-gptsovits', version: '1.0.0' }), 'utf-8')
      writeFileSync(join(srcRoot, 'tts-gptsovits', 'weights', 'model.bin'), 'x')

      const dest = join(root, 'dest-root')
      const { setRuntimePluginsDir } = await load()
      const res = await setRuntimePluginsDir(dest)

      expect(res.ok).toBe(true)
      expect(res.movedPlugins).toEqual(['tts-gptsovits'])
      // 新目录有内容、旧目录被删、配置已更新
      expect(existsSync(join(dest, 'tts-gptsovits', 'weights', 'model.bin'))).toBe(true)
      expect(existsSync(join(srcRoot, 'tts-gptsovits'))).toBe(false)
      expect(configStoreMap.get('runtime-plugins:config.json')).toMatchObject({ dir: dest })
    })

    it('目标路径不是目录 → 报错', async () => {
      const srcRoot = process.env.KITSUNE_RUNTIME_PLUGINS_DIR!
      mkdirSync(srcRoot, { recursive: true })
      const fileTarget = join(root, 'not-dir')
      writeFileSync(fileTarget, 'file', 'utf-8')

      const { setRuntimePluginsDir } = await load()
      const res = await setRuntimePluginsDir(fileTarget)

      expect(res.ok).toBe(false)
      expect(res.message).toContain('不是目录')
    })

    it('与当前目录相同 → no-op', async () => {
      const srcRoot = process.env.KITSUNE_RUNTIME_PLUGINS_DIR!
      mkdirSync(srcRoot, { recursive: true })

      const { setRuntimePluginsDir } = await load()
      const res = await setRuntimePluginsDir(srcRoot)

      expect(res.ok).toBe(true)
      expect(res.movedPlugins).toEqual([])
    })
  })

  describe('installRuntimePluginFromLocal', () => {
    it('源目录不存在 → 抛错', async () => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = root
      const { installRuntimePluginFromLocal } = await load()

      await expect(installRuntimePluginFromLocal('tts-gptsovits', join(root, 'missing'))).rejects.toThrow('源目录不存在')
    })

    it('复制源目录内容并写入安装标记', async () => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = root
      const src = join(root, 'engine-src')
      mkdirSync(join(src, 'sub'), { recursive: true })
      writeFileSync(join(src, 'main.py'), 'code')
      writeFileSync(join(src, 'sub', 'data.bin'), 'bin')

      const { installRuntimePluginFromLocal, resolvePluginRoot } = await load()
      const installed = await installRuntimePluginFromLocal('tts-gptsovits', src)
      const expected = join(root, 'tts-gptsovits')

      expect(installed).toBe(expected)
      expect(existsSync(join(expected, 'main.py'))).toBe(true)
      expect(existsSync(join(expected, 'sub', 'data.bin'))).toBe(true)
      const marker = JSON.parse(readFileSync(join(expected, '.plugin.json'), 'utf-8'))
      expect(marker).toMatchObject({ id: 'tts-gptsovits', version: '1.0.0' })
      expect(resolvePluginRoot('tts-gptsovits')).toBe(expected)
    })
  })

  describe('installRuntimePluginFromLocalZips', () => {
    it('无匹配分卷 → 抛错', async () => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = root
      const vols = join(root, 'vols')
      mkdirSync(vols, { recursive: true })
      writeFileSync(join(vols, 'unrelated.zip'), 'x')

      const { installRuntimePluginFromLocalZips } = await load()
      await expect(installRuntimePluginFromLocalZips('tts-gptsovits', vols)).rejects.toThrow('未找到')
    })

    it('目录不存在 → 抛错', async () => {
      process.env.KITSUNE_RUNTIME_PLUGINS_DIR = root
      const { installRuntimePluginFromLocalZips } = await load()
      await expect(installRuntimePluginFromLocalZips('tts-gptsovits', join(root, 'nope'))).rejects.toThrow('目录不存在')
    })
  })
})