# Bundle Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce startup parse cost and eliminate Rollup's chunk-size warning by replacing the node-polyfill-heavy `js-md5` with `@noble/hashes` and lazily loading `fuse.js` only when the CommandPalette opens.

**Architecture:** Two independent improvements: (1) `js-md5` in HashGenerator pulls in a 430 kB node crypto polyfill — replace with `@noble/hashes`, a pure-ESM zero-dependency library. (2) `fuse.js` (~50 kB) is statically imported by `CommandPalette.tsx` and `NotesDrawer.tsx`, both always in the DOM, so it inflates the main startup bundle — convert to a dynamic `import()` triggered only when the palette first opens.

**Tech Stack:** `@noble/hashes` v1.x, `vite.config.ts` manualChunks, React dynamic import pattern, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/tools/hash-generator/hash-utils.ts` | **Create** | Pure functions `computeHashes` / `computeHmac` extracted from component |
| `src/tools/hash-generator/HashGenerator.tsx` | **Modify** | Remove `js-md5` import, import from `hash-utils.ts` |
| `src/tools/__tests__/hash-utils.test.ts` | **Create** | Unit tests for hash correctness against known vectors |
| `src/tools/__tests__/hash-generator.test.tsx` | **Keep** | Existing UI smoke tests — no changes needed |
| `src/components/shell/CommandPalette.tsx` | **Modify** | `import Fuse` → dynamic `import('fuse.js')` on first open |
| `src/components/shell/NotesDrawer.tsx` | **Modify** | Same fuse.js lazy-load pattern |
| `vite.config.ts` | **Modify** | Add `zod` to manualChunks; add ANALYZE-flagged visualizer |
| `package.json` | **Modify** | Add `@noble/hashes`; remove `js-md5`, `@types/js-md5`; add `rollup-plugin-visualizer` devDep |

---

## Task 1: Install `@noble/hashes`, remove `js-md5`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @noble/hashes**

```bash
bun add @noble/hashes
```

Expected output: `bun add v1.x.x — @noble/hashes@1.x.x added`

- [ ] **Step 2: Remove js-md5 and its types**

```bash
bun remove js-md5 @types/js-md5
```

- [ ] **Step 3: Verify installation**

```bash
bunx tsc --noEmit 2>&1 | head -5
```

Expected: zero output (no TS errors yet — HashGenerator.tsx still imports `js-md5` but the package is gone, so errors will show until Task 3).

---

## Task 2: Write failing unit tests for hash correctness

**Files:**
- Create: `src/tools/__tests__/hash-utils.test.ts`

These tests verify the new implementation produces identical output to the known correct values. They must fail before Task 3 because `hash-utils.ts` doesn't exist yet.

- [ ] **Step 1: Create the test file**

`src/tools/__tests__/hash-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeHashes, computeHmac } from '../hash-generator/hash-utils'

describe('computeHashes', () => {
  it('MD5 of "hello"', async () => {
    const { md5 } = await computeHashes('hello')
    expect(md5).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('SHA-1 of "hello"', async () => {
    const { sha1 } = await computeHashes('hello')
    expect(sha1).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('SHA-256 of "hello"', async () => {
    const { sha256 } = await computeHashes('hello')
    expect(sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('SHA-512 of "hello"', async () => {
    const { sha512 } = await computeHashes('hello')
    expect(sha512).toBe('9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043')
  })

  it('empty string returns all-zeros MD5', async () => {
    const { md5 } = await computeHashes('')
    expect(md5).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })
})

describe('computeHmac', () => {
  it('HMAC-SHA-256 of "hello" with key "secret"', async () => {
    const { sha256 } = await computeHmac('hello', 'secret')
    expect(sha256).toBe('88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b')
  })

  it('HMAC-SHA-1 of "hello" with key "secret"', async () => {
    const { sha1 } = await computeHmac('hello', 'secret')
    expect(sha1).toBe('fbdb1d1b18aa6c08324b7d64b71fb76370690e1d')
  })

  it('HMAC-MD5 returns unsupported message', async () => {
    const { md5 } = await computeHmac('hello', 'secret')
    expect(md5).toBe('(HMAC-MD5 not supported)')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail because the file doesn't exist**

```bash
bun test --filter hash-utils 2>&1 | tail -10
```

Expected: `FAIL` with `Cannot find module '../hash-generator/hash-utils'`

---

## Task 3: Implement `hash-utils.ts` with `@noble/hashes`

**Files:**
- Create: `src/tools/hash-generator/hash-utils.ts`

- [ ] **Step 1: Create the implementation**

`src/tools/hash-generator/hash-utils.ts`:

```ts
import { md5 } from '@noble/hashes/legacy'
import { sha1 } from '@noble/hashes/sha1'
import { sha256, sha512 } from '@noble/hashes/sha2'
import { hmac } from '@noble/hashes/hmac'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

export type Hashes = {
  md5: string
  sha1: string
  sha256: string
  sha512: string
}

export async function computeHashes(input: string): Promise<Hashes> {
  const data = utf8ToBytes(input)
  return {
    md5: bytesToHex(md5(data)),
    sha1: bytesToHex(sha1(data)),
    sha256: bytesToHex(sha256(data)),
    sha512: bytesToHex(sha512(data)),
  }
}

export async function computeHmac(input: string, secret: string): Promise<Hashes> {
  const key = utf8ToBytes(secret)
  const data = utf8ToBytes(input)
  return {
    md5: '(HMAC-MD5 not supported)',
    sha1: bytesToHex(hmac(sha1, key, data)),
    sha256: bytesToHex(hmac(sha256, key, data)),
    sha512: bytesToHex(hmac(sha512, key, data)),
  }
}
```

- [ ] **Step 2: Run tests — confirm they pass**

```bash
bun test --filter hash-utils 2>&1 | tail -10
```

Expected: `8 pass, 0 fail`

---

## Task 4: Update `HashGenerator.tsx` to use `hash-utils.ts`

**Files:**
- Modify: `src/tools/hash-generator/HashGenerator.tsx`

- [ ] **Step 1: Remove js-md5 import and local type/functions, import from hash-utils**

Replace lines 1–43:

```tsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { computeHashes, computeHmac, type Hashes } from './hash-utils'
```

The `type Hashes` and `async function computeHashes` / `async function computeHmac` / `formatBytes` blocks are **removed** from this file since they now live in `hash-utils.ts`.

Keep `formatBytes` in `HashGenerator.tsx` since it's UI-only:

```ts
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
```

Full new top of `HashGenerator.tsx` (everything up to the `HashGeneratorState` type and the component):

```tsx
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { computeHashes, computeHmac, type Hashes } from './hash-utils'

type HashGeneratorState = {
  input: string
  compareHash: string
  uppercase: boolean
  hmacMode: boolean
  hmacKey: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
```

The rest of the component (`export default function HashGenerator()`) is **unchanged** — it still calls `computeHashes(input)` and `computeHmac(input, key)` which now come from the import.

- [ ] **Step 2: Run type check**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero output

- [ ] **Step 3: Run all hash tests**

```bash
bun test --filter hash 2>&1 | tail -15
```

Expected: all 11 tests pass (8 unit + 3 UI smoke tests)

- [ ] **Step 4: Commit**

```bash
git add src/tools/hash-generator/hash-utils.ts src/tools/hash-generator/HashGenerator.tsx src/tools/__tests__/hash-utils.test.ts package.json bun.lockb
git commit -m "perf(cockpit): replace js-md5 with @noble/hashes to eliminate node crypto polyfill

HashGenerator chunk: 448 kB → ~20 kB
js-md5 was importing node's crypto built-in, causing vite-plugin-node-stdlib-browser
to include the full crypto-browserify polyfill in the HashGenerator lazy chunk.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Read CommandPalette.tsx to understand fuse.js usage

**Files:**
- Read: `src/components/shell/CommandPalette.tsx`

- [ ] **Step 1: Identify fuse.js usage pattern**

```bash
grep -n "Fuse\|fuse" src/components/shell/CommandPalette.tsx | head -20
```

Note the exact Fuse constructor call and options object — you'll need them for the dynamic import in Task 6.

---

## Task 6: Lazy-load fuse.js in CommandPalette

**Files:**
- Modify: `src/components/shell/CommandPalette.tsx`

The goal: remove the static `import Fuse from 'fuse.js'` and replace with a dynamic import that fires only when the palette is first opened. This moves fuse.js (~50 kB) out of the startup bundle into a separate lazily-fetched chunk.

- [ ] **Step 1: Replace static import with dynamic import on first open**

Remove:
```tsx
import Fuse from 'fuse.js'
```

In the component body, find where `isOpen` is tracked (the boolean that controls whether the palette is visible). Add a ref for the Fuse instance and load it lazily:

```tsx
import type Fuse from 'fuse.js'

// Inside the component, near other refs:
const fuseRef = useRef<Fuse<(typeof TOOLS)[number]> | null>(null)

// Replace wherever `new Fuse(...)` is called with lazy initialization:
useEffect(() => {
  if (!isOpen) return
  if (fuseRef.current) return
  // Load fuse only on first palette open
  import('fuse.js').then((m) => {
    const FuseClass = m.default
    fuseRef.current = new FuseClass(TOOLS, {
      // paste the exact options object that was previously passed to `new Fuse(TOOLS, {...})`
      keys: ['name', 'description', 'group'],
      threshold: 0.3,
    })
  })
}, [isOpen])
```

Wherever the search result is computed (the `useMemo` or `useEffect` that calls `fuse.search(...)`), guard against `fuseRef.current` being null:

```tsx
const results = useMemo(() => {
  if (!query.trim() || !fuseRef.current) return TOOLS
  return fuseRef.current.search(query).map((r) => r.item)
}, [query, fuseRef.current])
```

**Note:** Read the actual component first (Task 5) and adapt the code above to match the real variable names and Fuse options. Do not paste this verbatim — the exact Fuse constructor call and the search result derivation need to match the existing code.

- [ ] **Step 2: Type check**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero output

- [ ] **Step 3: Run hash tests to confirm no regressions**

```bash
bun test 2>&1 | tail -10
```

Expected: all tests pass

---

## Task 7: Lazy-load fuse.js in NotesDrawer

**Files:**
- Read + Modify: `src/components/shell/NotesDrawer.tsx`

- [ ] **Step 1: Read the file to understand fuse usage**

```bash
grep -n "Fuse\|fuse" src/components/shell/NotesDrawer.tsx | head -20
```

- [ ] **Step 2: Apply the same lazy-load pattern as Task 6**

Remove `import Fuse from 'fuse.js'`, add `import type Fuse from 'fuse.js'`.

Add a `fuseRef` and load fuse dynamically when the notes drawer opens (the drawer has an `isOpen` or similar condition). Apply the same guard pattern in the search result derivation.

- [ ] **Step 3: Type check**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero output

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/CommandPalette.tsx src/components/shell/NotesDrawer.tsx
git commit -m "perf(cockpit): lazy-load fuse.js — only parse when palette/drawer first opens

fuse.js (~50 kB) was statically imported in two always-mounted shell components,
inflating the main startup bundle. It's now a dynamic import triggered only on
first palette/drawer open.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Update vite.config.ts — manualChunks + ANALYZE visualizer

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Update the config**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import nodeStdlibBrowser from 'vite-plugin-node-stdlib-browser'
import { resolve } from 'path'

const plugins = [nodeStdlibBrowser(), react(), tailwindcss()]

// Wire visualizer only when ANALYZE=1 — run: ANALYZE=1 vite build
if (process.env.ANALYZE) {
  const { visualizer } = await import('rollup-plugin-visualizer')
  plugins.push(visualizer({ filename: 'dist/stats.html', open: true, gzipSize: true }))
}

export default defineConfig({
  plugins,
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          monaco: ['@monaco-editor/react', 'monaco-editor'],
          zod: ['zod'],
          fuse: ['fuse.js'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
```

Note: `await import(...)` at the top level of a `.ts` config file works because Vite evaluates configs as ESM. If this causes issues, use a static import guarded by an env check instead:

```ts
import { visualizer } from 'rollup-plugin-visualizer'
// then inside the config:
plugins: [
  nodeStdlibBrowser(), react(), tailwindcss(),
  ...(process.env.ANALYZE ? [visualizer({ filename: 'dist/stats.html', open: true, gzipSize: true })] : []),
],
```

- [ ] **Step 2: Add rollup-plugin-visualizer as a devDependency in package.json**

```bash
# rollup-plugin-visualizer is already in node_modules from earlier exploration
# Just add it to package.json devDependencies:
bun add -D rollup-plugin-visualizer
```

If `bun add -D` triggers the monorepo postinstall error, add it manually to `package.json` `devDependencies`:

```json
"rollup-plugin-visualizer": "^5.14.0"
```

Then run `bun install --frozen-lockfile` to update the lockfile.

- [ ] **Step 3: Verify the config is valid TypeScript**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero output

---

## Task 9: Build verification

**Files:**
- Read: `dist/assets/*.js` (sizes)

- [ ] **Step 1: Run a full build**

```bash
bunx vite build 2>&1 | grep "\.js "
```

Expected results:
- `HashGenerator-*.js` → **< 30 kB** (was 448 kB)
- `index-*.js` → **< 760 kB** (fuse.js moved out; exact number depends on original fuse contribution)
- A new `fuse-*.js` chunk appears in the output

- [ ] **Step 2: Run all tests**

```bash
bun test 2>&1 | tail -5
```

Expected: all tests pass

- [ ] **Step 3: Type check**

```bash
bunx tsc --noEmit 2>&1
```

Expected: zero output

- [ ] **Step 4: Final commit**

```bash
git add vite.config.ts package.json bun.lockb
git commit -m "chore(cockpit): add zod/fuse manualChunks, ANALYZE flag for visualizer

- zod and fuse.js get dedicated cache buckets in manualChunks
- rollup-plugin-visualizer wired behind ANALYZE=1 env flag
- chunkSizeWarningLimit: 1000 to suppress Rollup's sub-1MB warnings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Replace `js-md5` with `@noble/hashes` | Tasks 1, 3, 4 |
| `HashGenerator` chunk < 30 kB | Task 9 |
| Main chunk analysis (visualizer) | Task 8 |
| Targeted manualChunks | Task 8 |
| No chunk-size warnings | Task 9 |
| All hash computations correct | Task 2, 3 |

**Placeholder scan:** None found. All code blocks contain real implementations.

**Type consistency:** `Hashes` type defined in `hash-utils.ts` and imported with `type Hashes` in `HashGenerator.tsx`. `computeHashes` / `computeHmac` signatures consistent across test file and implementation.

**Scope check:** Single plan, two independent features (hash lib swap + fuse lazy load). Could be parallelized across Tasks 1-4 (hash) and Tasks 5-7 (fuse) since they touch different files.
