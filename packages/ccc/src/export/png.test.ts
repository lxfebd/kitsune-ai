import { readFile } from 'node:fs/promises'

import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { defineCard } from '../define'
import { exportToPNG, exportToPNGBase64 } from './png'

const fixturePng = fileURLToPath(new URL('../../test/fixture/mini.png', import.meta.url))

describe('exportToPNG', () => {
  it('embeds card data as CCv3 metadata in a PNG', async () => {
    const png = await readFile(fixturePng)
    const card = defineCard({
      name: 'Seraphina',
      creator: 'OtisAlejandro',
    })

    const result = exportToPNG(card, png)

    // PNG signature is preserved.
    expect(result.slice(0, 8)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // Output is larger than the source — metadata chunk was added.
    expect(result.length).toBeGreaterThan(png.length)
  })
})

describe('exportToPNGBase64', () => {
  it('embeds card data into a base64 PNG data URI', async () => {
    const png = await readFile(fixturePng)
    const card = defineCard({ name: 'Seraphina' })

    const result = exportToPNGBase64(card, `data:image/png;base64,${png.toString('base64')}`)

    expect(result.startsWith('data:image/png;base64,')).toBe(true)
    // Output is larger than the source — metadata chunk was added.
    expect(result.length).toBeGreaterThan(`data:image/png;base64,${png.toString('base64')}`.length)
  })
})