import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveVoiceMeta } from './index'

describe('resolveVoiceMeta', () => {
  const tempRoots: string[] = []

  async function makeGptSovitsDir(overrides: {
    voiceId?: string
    displayName?: string
    language?: string
    reference?: string
  } = {}): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'gptsovits-test-'))
    tempRoots.push(root)

    const voiceId = overrides.voiceId ?? 'ailini'
    const displayName = overrides.displayName ?? voiceId
    const voiceDir = join(root, 'voices', voiceId)
    await mkdir(voiceDir, { recursive: true })

    const manifest = {
      id: voiceId,
      display_name: displayName,
      language: overrides.language ?? 'zh',
      default_reference: overrides.reference ?? 'reference.wav',
      default_prompt_text: '你好，这是一个测试。',
      gpt_model: 'weights/gpt.ckpt',
      sovits_model: 'weights/sovits.pth',
    }
    await writeFile(join(voiceDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')
    await writeFile(join(voiceDir, 'reference.wav'), Buffer.from('RIFF'), 'utf-8')

    return root
  }

  afterEach(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true })
    }
    tempRoots.length = 0
  })

  it('resolves voice meta from direct voices/<id>/manifest.json', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'ailini', language: 'ja' })

    const meta = resolveVoiceMeta(root, 'ailini')

    expect(meta.voiceDir).toBe(join(root, 'voices', 'ailini'))
    expect(meta.referWavPath).toBe(join(root, 'voices', 'ailini', 'reference.wav'))
    expect(meta.promptText).toBe('你好，这是一个测试。')
    expect(meta.promptLanguage).toBe('ja')
    expect(meta.gptModel).toBe('weights/gpt.ckpt')
    expect(meta.sovitsModel).toBe('weights/sovits.pth')
    expect(meta.expiresAt).toBeGreaterThan(Date.now())
  })

  it('matches voice by display_name when directory id differs', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'voice-1', displayName: '艾琳' })

    const meta = resolveVoiceMeta(root, '艾琳')

    expect(meta.voiceDir).toBe(join(root, 'voices', 'voice-1'))
  })

  it('throws when the voice does not exist', async () => {
    const root = await makeGptSovitsDir()

    expect(() => resolveVoiceMeta(root, 'missing-voice')).toThrow(/不存在/)
  })

  it('caches the resolved meta across calls for the same (dir, voiceId)', async () => {
    const root = await makeGptSovitsDir({ voiceId: 'ailini' })

    const first = resolveVoiceMeta(root, 'ailini')
    const second = resolveVoiceMeta(root, 'ailini')

    // 同一缓存对象：命中缓存而非重新解析（expiresAt 保持原值）
    expect(second).toBe(first)
    expect(second.expiresAt).toBe(first.expiresAt)
  })
})
