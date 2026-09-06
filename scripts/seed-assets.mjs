// Seed the unplugin-fetch Download cache (.cache/) from git-tracked assets.
//
// unplugin-fetch's Download plugin only checks its `cacheDir` (.cache/) before
// fetching the URL; it does NOT check `parentDir` (packages/stage-ui/src/assets)
// even when the file already exists there. The upstream asset host
// (assets.kitsune.ai) no longer resolves, so without this seed, `vite build` in
// apps/stage-pocket fails at config time with ENOTFOUND.
//
// Run: node scripts/seed-assets.mjs  (root)
import { mkdir, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'packages', 'stage-ui', 'src', 'assets')
const dst = join(root, '.cache')

// Map of relative path under assets/ => relative path under .cache/
const copies = [
  ['live2d/models/hiyori_free_zh.zip', 'live2d/models/hiyori_free_zh.zip'],
  ['live2d/models/hiyori_pro_zh.zip', 'live2d/models/hiyori_pro_zh.zip'],
  ['vrm/models/AvatarSample-A/AvatarSample_A.vrm', 'vrm/models/AvatarSample-A/AvatarSample_A.vrm'],
  ['vrm/models/AvatarSample-B/AvatarSample_B.vrm', 'vrm/models/AvatarSample-B/AvatarSample_B.vrm'],
]

let copied = 0
for (const [fromRel, toRel] of copies) {
  const from = join(src, fromRel)
  const to = join(dst, toRel)
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  copied += 1
}
console.log(`seeded ${copied} assets into .cache/`)