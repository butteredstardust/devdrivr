import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// React 19 compares `dangerouslySetInnerHTML` by object identity, not by the
// `__html` string inside it (React 18 compared the string). An inline object
// literal is therefore a new value every render, so React re-sets innerHTML on
// every render — rebuilding the subtree and destroying any text selection the
// user has made inside it. Every call site must pass a memoised object.
//
// See documentation/BROWSER_HARNESS.md § The React 19 identity rule.

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      files.push(...sourceFiles(full))
    } else if (entry.name.endsWith('.tsx')) {
      files.push(full)
    }
  }
  return files
}

describe('dangerouslySetInnerHTML', () => {
  it('is never passed an inline object literal', () => {
    const offenders = sourceFiles(SRC_ROOT).filter((file) =>
      readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML={{')
    )

    expect(offenders.map((f) => f.slice(SRC_ROOT.length))).toEqual([])
  })
})
