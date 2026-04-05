# Bundle Optimization Design

**Date:** 2026-04-05
**Branch:** feat/history-improvements (then PR to main)
**Goal:** Reduce initial parse cost so the Tauri WebView starts faster.

---

## Problem

`bun run tauri build` emits:

```
dist/assets/index-G5aG-Ah2.js   799.49 kB │ gzip: 235.73 kB
(!) Some chunks are larger than 500 kB after minification.
```

A secondary issue: `HashGenerator-1wtafpC0.js` is **448 kB** — far too large for a tool that only computes hashes. The culprit is `js-md5` importing node's `crypto` module, causing `vite-plugin-node-stdlib-browser` to pull in the full node crypto polyfill.

All 28 tools are already wrapped in `React.lazy()` in `tool-registry.ts`, so tool code and tool-specific deps are deferred. The remaining issues are in shared deps leaking into the main chunk and the `js-md5` polyfill.

---

## Fix 1: Replace `js-md5` with `@noble/hashes`

### Problem
`js-md5` pulls in node's `crypto` built-in as a transitive dependency. `vite-plugin-node-stdlib-browser` polyfills it, inflating the `HashGenerator` chunk from ~5 kB (actual code) to 448 kB.

### Solution
Replace `js-md5` and `@types/js-md5` with `@noble/hashes`.

`@noble/hashes` is:
- Pure ESM, zero node built-in dependencies
- Tree-shakeable (import only what you use)
- ~15 kB for the full suite (MD5, SHA-1, SHA-256, SHA-512, HMAC)
- The de-facto standard for browser crypto in the JS ecosystem

### Changes
- `package.json`: remove `js-md5`, `@types/js-md5`; add `@noble/hashes`
- `HashGenerator.tsx`: replace `import { md5 } from 'js-md5'` with `import { md5 } from '@noble/hashes/legacy'`
  - SHA variants currently use `crypto.subtle` — migrate to `@noble/hashes/sha2` and `@noble/hashes/sha1` for consistency and to ensure no polyfill surface
  - HMAC: use `@noble/hashes/hmac`

### Expected result
`HashGenerator` chunk: **448 kB → ~20 kB**

---

## Fix 2: Visualize + targeted `manualChunks`

### Problem
The main `index` chunk is 799 kB. Since all tools are lazy, this is shared infrastructure code — stores, hooks, common components, and heavy deps imported outside tool boundaries.

### Solution — two-step

**Step A: Profile**

Add `rollup-plugin-visualizer` behind an `ANALYZE` env flag in `vite.config.ts`:

```ts
import { visualizer } from 'rollup-plugin-visualizer'

plugins: [
  ...,
  process.env.ANALYZE && visualizer({ open: true, gzipSize: true, brotliSize: true }),
].filter(Boolean)
```

Run `ANALYZE=1 vite build` and inspect the treemap to identify the top 3-5 contributors to the main chunk.

Known suspects (to confirm):
- `fuse.js` (used in sidebar search — might be importable lazily)
- `@tanstack/react-table` (if used in a tool that leaked into the main chunk)
- `@phosphor-icons/react` (SVG data — normally tree-shakes, but worth confirming)
- Any remaining node-stdlib polyfills not caught by Fix 1

**Step B: Add `manualChunks`**

For each dep confirmed by the visualizer as a top contributor, add it to `manualChunks` in `vite.config.ts`. Since all tool components are lazy, any dep extracted from the main chunk will parse only when the tool that uses it first opens.

Example shape (exact entries depend on visualizer findings):
```ts
manualChunks: {
  vendor: ['react', 'react-dom'],
  monaco: ['@monaco-editor/react', 'monaco-editor'],
  // Added based on visualizer:
  search: ['fuse.js'],
  table: ['@tanstack/react-table'],
}
```

### Expected result
Main chunk: **799 kB → target < 400 kB**

---

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Remove `js-md5`, `@types/js-md5`; add `@noble/hashes`, `rollup-plugin-visualizer` (dev) |
| `vite.config.ts` | Add visualizer plugin (ANALYZE flag) + new manualChunks entries |
| `src/tools/hash-generator/HashGenerator.tsx` | Swap `js-md5` + `crypto.subtle` calls → `@noble/hashes` |

---

## Success Criteria

- `HashGenerator` chunk < 30 kB
- Main `index` chunk < 400 kB (gzip < 120 kB)
- `bun run tauri build` produces no chunk size warnings
- All hash computations produce identical output to current implementation
- Existing hash-generator tests pass
