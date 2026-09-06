// Chunked oxlint runner for nano-staged pre-commit hook.
//
// Why this exists:
//   nano-staged passes the full list of staged files as command-line arguments to
//   `oxlint --fix`. On Windows, oxlint is launched through its `.cmd` shim which
//   routes the call through `cmd.exe /C`, and Windows' command-line length limit
//   (~8191 chars) is exceeded for large commits — causing oxlint to abort with
//   "命令行太长。" (command line too long) and the pre-commit hook to fail.
//
//   Node itself can receive a very long argv (it spawns via CreateProcess directly),
//   so this small wrapper receives the full file list from nano-staged, splits it
//   into small batches, and invokes `oxlint` once per batch with short command
//   lines. This keeps the hook working for large commits on every platform.
//
// Usage (configured in package.json -> "nano-staged"):
//   "*": "node scripts/oxlint-staged.mjs --fix"
// nano-staged appends the matched (absolute) file paths after the flags.

import { spawnSync } from 'node:child_process'
import path from 'node:path'

// argv after the script name: [<flags...>, <files...>]
const argv = process.argv.slice(2)

// Flags start with '-'; everything else is a file path.
const flags = argv.filter((arg) => arg.startsWith('-'))
const files = argv.filter((arg) => !arg.startsWith('-'))

// How many files to pass to a single `oxlint` invocation.
// Keeping this small guarantees the command line stays well under the
// Windows limit even with long absolute paths.
const CHUNK_SIZE = 25

if (files.length === 0) {
  // Nothing to lint (e.g. only non-source files staged).
  process.exit(0)
}

for (let i = 0; i < files.length; i += CHUNK_SIZE) {
  const chunk = files
    .slice(i, i + CHUNK_SIZE)
    // Use repo-relative paths to keep the command line short.
    .map((file) => path.relative(process.cwd(), file))

  const result = spawnSync('oxlint', [...flags, ...chunk], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true, // lets `oxlint` resolve via PATH (node_modules/.bin) on Windows
  })

  if (result.status !== 0) {
    // Propagate oxlint's failure so nano-staged restores the staged state.
    process.exit(result.status ?? 1)
  }
}

process.exit(0)
