# AGENTS.md — devdrivr cockpit

Instructions for AI coding agents (OpenAI Codex, GitHub Copilot, etc.) working in `apps/cockpit`.

---

## What This Project Is

**devdrivr cockpit** is a local-first, keyboard-driven developer utility desktop app.

- **Runtime**: Tauri 2 (Rust backend + WKWebView frontend)
- **UI**: React 19 + TypeScript 5.9 + Tailwind CSS 4
- **State**: Zustand 5 stores → SQLite (WAL mode) via `@tauri-apps/plugin-sql`
- **Build**: Vite 7 + Bun (package manager)
- **29 tools** across 7 groups (Code, Data, Web, Convert, Test, Network, Write)
- **No cloud, no accounts** — everything runs locally

---

## Commands (always run from `apps/cockpit/`)

```bash
bun install              # install/restore dependencies
bun run tauri dev        # start dev server (Vite + Tauri hot-reload)
bun run clean            # delete node_modules, dist, src-tauri/target
npx tsc --noEmit         # type-check — MUST pass before submitting
bunx vitest run          # run Vitest tests — MUST all pass (use bunx, not bun run test)
bun run tauri build      # production build
```

> **Note**: Always run these from `apps/cockpit/`. `bun run test` may fail if the shell
> cannot resolve the `vitest` binary — use `bunx vitest run` instead.

---

## File Map — Know Before You Touch

```
src/app/tool-registry.ts          ← SINGLE SOURCE OF TRUTH for all tools
src/app/tool-groups.tsx           ← sidebar group metadata (Phosphor icons)
src/app/providers.tsx             ← app bootstrap — window geometry, store init, listeners
src/app/App.tsx                   ← root layout: Sidebar + Workspace + NotesDrawer
src/lib/db.ts                     ← ALL SQLite access — use getDb() only
src/lib/theme.ts                  ← applyTheme() — only call inside async init()
src/lib/tool-actions.ts           ← pub/sub: dispatchToolAction / useToolActionListener
src/stores/settings.store.ts      ← theme, sidebar, editor prefs → persisted
src/stores/notes.store.ts         ← notes CRUD → persisted
src/stores/snippets.store.ts      ← snippets CRUD → persisted
src/stores/history.store.ts       ← tool execution history → persisted
src/stores/ui.store.ts            ← active tool, modals, toasts → transient
src/hooks/useToolState.ts         ← per-tool state persistence (cache + SQLite)
src/hooks/useWorker.ts            ← Web Worker RPC wrapper (no Comlink)
src/hooks/useGlobalShortcuts.ts   ← all keyboard shortcuts
src/workers/rpc.ts                ← worker-side RPC handler (replaces Comlink)
src/tools/<id>/<Name>.tsx         ← one component per tool
src/types/models.ts               ← AppSettings, Note, Snippet, HistoryEntry types
src-tauri/capabilities/default.json ← IPC permissions — add here for new Tauri APIs
src-tauri/migrations/001_initial.sql ← full DB schema
src-tauri/tauri.conf.json         ← window size, bundle config, app identifier
```

---

## Non-Negotiable Rules

### 1. Package manager: Bun only

```bash
# ✅
bun install
bun add <package>
bun run <script>

# ❌ Never
npm install
yarn add
```

### 2. DB access: always `getDb()`, never `Database.load()`

```typescript
// ✅
import { getDb } from '@/lib/db'
const conn = await getDb()
const rows = await conn.select<Row[]>('SELECT * FROM notes')

// ❌ Instant bug — breaks the connection singleton
import Database from '@tauri-apps/plugin-sql'
const db = await Database.load('sqlite:cockpit.db')
```

### 3. Colors: CSS variables only, never hardcode

```typescript
// ✅
className="bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]"

// ❌ Breaks dark/light theme switching
className="bg-zinc-900 text-white border-gray-700"
style={{ color: '#39ff14' }}
```

Available tokens: `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`,
`--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-dim`, `--color-error`,
`--color-warning`, `--color-success`, `--color-info`, `--color-shadow`

### 4. Web Workers: `?worker` imports only

```typescript
// ✅ Vite bundles as blob URL — works in Tauri's WKWebView
import MyWorkerFactory from '@/workers/my.worker?worker'
const worker = useWorker<MyWorker>(() => new MyWorkerFactory(), ['method1'])

// ❌ Module workers are unreliable in WKWebView — Proxy returns undefined
new Worker(new URL('./my.worker.ts', import.meta.url), { type: 'module' })
```

### 5. Workers: use `handleRpc`, not Comlink's `expose`

```typescript
// ✅ Workers must end with this
import { handleRpc } from './rpc'
handleRpc(api)

// ❌ Comlink was removed — Proxy-based wrap() returns undefined in WKWebView
import { expose } from 'comlink'
expose(api)
```

### 6. Zustand: selector functions always

```typescript
// ✅ Only re-renders when 'theme' changes
const theme = useSettingsStore((s) => s.theme)

// ❌ Re-renders on any store change
const { theme } = useSettingsStore()
const store = useSettingsStore()
```

### 7. Store init: idempotent promise guard required

```typescript
// Every new store init() MUST have this pattern
let initPromise: Promise<void> | null = null

init: async () => {
  if (!initPromise) {
    initPromise = (async () => {
      const conn = await getDb()
      const rows = await conn.select<Row[]>('SELECT * FROM my_table')
      set({ items: rows.map(toModel) })
    })()
  }
  return initPromise
}
```

### 8. Never add `React.StrictMode`

Intentionally removed. Causes double-mount flash in Tauri's WebView. Don't add it back.

### 9. Never create new Tauri windows

`new WebviewWindow(...)` was removed. IPC capability scoping + listener leak issues.
Use drawers, panels, or modals within the existing window instead.

### 10. DPI conversion for window APIs

```typescript
// ✅ Always convert physical → logical before saving
const factor = await win.scaleFactor()
const pos = (await win.outerPosition()).toLogical(factor)
const sz = (await win.outerSize()).toLogical(factor)

// ❌ Raw physical pixels — doubled on Retina displays
const pos = await win.outerPosition()
await win.setPosition(pos)
```

### 11. `applyTheme()` only inside async init functions

```typescript
// ✅
init: async () => {
  const settings = await loadSettings()
  applyTheme(settings.theme)
}

// ❌ Causes flash before DB theme is loaded
applyTheme('system') // at module level
```

### 12. Icons: Phosphor only

```typescript
// ✅
import { ArrowRight, Clipboard } from '@phosphor-icons/react'
<ArrowRight size={16} weight="bold" />

// ❌ No emoji, no inline SVG, no other icon libraries
<span>→</span>
```

### 13. Never use the Preview MCP tool

This is a Tauri desktop app. The browser-based preview cannot render it.
Do not call `preview_start` or any preview tool unless the user explicitly asks.

### 14. Use `TextEncoder`/`TextDecoder` for UTF-8, not `unescape`/`escape`

```typescript
// ✅ Encode text → base64 (handles full Unicode)
const bytes = new TextEncoder().encode(text)
let binary = ''
for (const byte of bytes) binary += String.fromCharCode(byte)
const encoded = btoa(binary)

// ✅ Decode base64 → text
const decoded = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const text = new TextDecoder().decode(decoded)

// ❌ Deprecated — breaks on multi-byte characters
btoa(unescape(encodeURIComponent(text)))
decodeURIComponent(escape(atob(b64)))
```

### 15. React 19 — Wheel events are passive by default

`onWheel` in JSX cannot call `e.preventDefault()` (browser ignores it). Attach the
listener imperatively for any zoom / scroll-hijack:

```typescript
useEffect(() => {
  const el = ref.current
  if (!el) return
  const onWheel = (e: WheelEvent) => {
    e.preventDefault() /* zoom */
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => el.removeEventListener('wheel', onWheel)
}, [])
```

### 16. Refs on conditional JSX branches — use callback refs, not `useRef` + `useEffect`

If a `ref` is attached to an element inside a conditional branch, a plain `useRef`
will be `null` when the `useEffect` runs on mount (the branch may not be active).
Use a `useCallback` callback ref so the listener attaches/detaches as the node
mounts and unmounts:

```typescript
const wheelCleanupRef = useRef<(() => void) | null>(null)

const callbackRef = useCallback((el: HTMLDivElement | null) => {
  wheelCleanupRef.current?.()
  wheelCleanupRef.current = null
  if (!el) return
  const onWheel = (e: WheelEvent) => {
    e.preventDefault() /* ... */
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel)
}, []) // deps: only stable values

// <div ref={callbackRef}>
```

### 17. ResizeObserver: guard for jsdom

`ResizeObserver` is `undefined` in the Vitest/jsdom environment. Always guard:

```typescript
if (typeof ResizeObserver === 'undefined') return
const observer = new ResizeObserver(update)
observer.observe(el)
return () => observer.disconnect()
```

### 18. Cross-tool navigation — inject state via `useToolStateCache`

To pre-populate a destination tool before navigating, write to `useToolStateCache`.
The destination reads from it synchronously on mount — no IPC or pub/sub needed:

```typescript
const cacheSet = useToolStateCache((s) => s.set)
const cacheGet = useToolStateCache((s) => s.get)
const openTab = useUiStore((s) => s.openTab)

cacheSet('target-tool', {
  ...cacheGet('target-tool'),
  draft: {
    /* ... */
  },
})
openTab('target-tool')
```

### 19. Canvas 2D is sufficient for image processing

No npm image library is needed for resize, crop, format conversion, or quality control.
Canvas handles all of it:

```typescript
canvas.width = outW
canvas.height = outH
ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
canvas.toBlob(
  (blob) => {
    /* download */
  },
  'image/jpeg',
  quality / 100
)
```

For large images, debounce any input that triggers `toDataURL`/`toBlob` on every keystroke.

### 20. Crop / geometry math — clamp dimensions before position

When clamping a crop/selection rectangle to image bounds, always clamp `w`/`h` first
so the subsequent `x`/`y` clamp expressions (`origW - w`, `origH - h`) use valid values:

```typescript
w = Math.max(1, Math.min(w, origW))
h = Math.max(1, Math.min(h, origH))
x = Math.max(0, Math.min(x, origW - w))
y = Math.max(0, Math.min(y, origH - h))
```

Also lower-bound any new `x`/`y` computed from a drag delta before using it to derive
a new `w`/`h` (e.g., NW/SW handle drag: `nx = Math.max(0, startX + dx)`).

### 21. Fuse.js search highlighting — use composite React keys

When using `includeMatches: true`, define a local interface instead of importing Fuse types:

```typescript
interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}
```

Keep two memos: `fuseResults` (drives both filtered list AND match data) and `matchMap: Map<id, ReadonlyArray<FuseMatchEntry>>`.

**Always use composite keys** on `<mark>` elements — `key={\`${start}-${end}\`}`, not `key={start}`. Fuse can return overlapping index ranges with the same `start` value, causing duplicate key warnings.

### 22. CSS grid collapse animation

```tsx
<div
  className={`grid transition-[grid-template-rows] duration-200 ${
    collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
  }`}
>
  <div className="overflow-hidden">{children}</div>
</div>
```

No pixel height needed. Outer div transitions row size; inner `overflow-hidden` clips content. Toggle button must have `aria-expanded={!collapsed}`.

### 23. ARIA combobox — wiring and focus management

```tsx
<input
  role="combobox"
  aria-autocomplete="list"
  aria-expanded={suggestions.length > 0}
  aria-controls="suggestions-id"
  aria-activedescendant={index >= 0 ? `suggestion-${suggestions[index]}` : undefined}
/>
<div role="listbox" id="suggestions-id">
  {suggestions.map((s) => (
    <button key={s} role="option" id={`suggestion-${s}`}
      onMouseDown={(e) => { e.preventDefault(); void handleSelect(s) }}
    />
  ))}
</div>
```

`e.preventDefault()` on `onMouseDown` keeps input focus when clicking a suggestion. Always prefix async `onMouseDown` handlers with `void` — omitting it leaves an unhandled promise rejection.

### 24. `void` prefix for async fire-and-forget event handlers

Calling an async function from a synchronous event handler without handling the returned Promise causes an unhandled rejection warning. Use `void`:

```typescript
// ✅
onMouseDown={() => { void handleAsyncAction() }}
onChange={() => { void saveToDb(value) }}

// ❌ Returns a Promise that is silently dropped — triggers lint/runtime warning
onMouseDown={() => handleAsyncAction()}
```

---

## How to Add a New Tool

```typescript
// Step 1: Create src/tools/<id>/<Name>.tsx
export default function MyTool() {
  const [state, updateState] = useToolState<State>('my-tool', { input: '', output: '' })
  const setLastAction = useUiStore((s) => s.setLastAction)

  useToolAction(async (action) => {
    if (action.type === 'execute') await run()
    if (action.type === 'copy-output') navigator.clipboard.writeText(state.output)
    if (action.type === 'open-file') updateState({ input: action.content })
  })

  return <div className="flex h-full flex-col">...</div>
}

// Step 2: Register in src/app/tool-registry.ts
{
  id: 'my-tool',
  name: 'My Tool',
  group: 'convert',   // code | data | web | convert | test | network | write
  component: React.lazy(() => import('@/tools/my-tool/MyTool')),
  keywords: ['keyword'],
}
```

## How to Add a New Setting

```typescript
// 1. src/types/models.ts — add to AppSettings type + DEFAULT_SETTINGS
export type AppSettings = {
  ...
  myNewSetting: boolean
}
export const DEFAULT_SETTINGS: AppSettings = {
  ...
  myNewSetting: false
}

// 2. src/stores/settings.store.ts — add to the persisted object in update()
const settings: AppSettings = {
  ...
  myNewSetting: state.myNewSetting,
}
```

## How to Add a New Worker

```typescript
// src/workers/my.worker.ts
import { handleRpc } from './rpc'

const api = {
  async process(input: string): Promise<string> {
    return input.toUpperCase()
  },
}

export type MyWorker = typeof api
handleRpc(api)

// In the tool component:
import MyWorkerFactory from '@/workers/my.worker?worker'
import type { MyWorker } from '@/workers/my.worker'

const worker = useWorker<MyWorker>(() => new MyWorkerFactory(), ['process'])
const result = worker ? await worker.process(input) : null
```

---

## TypeScript Strict Mode — Common Traps

```typescript
// noUncheckedIndexedAccess — array access returns T | undefined
const items = getItems()
const first = items[0]          // type: Item | undefined — must check
const name = items[0]?.name     // ✅

// exactOptionalPropertyTypes — optional props are exact
type T = { label?: string }
const t: T = { label: undefined }  // may error in some contexts — use {} instead

// No any — use unknown or proper generics
const data: unknown = JSON.parse(str)
if (typeof data === 'object' && data !== null) { ... }
```

---

## SQLite Schema Quick Reference

```sql
settings         (key TEXT PRIMARY KEY, value TEXT)            -- JSON values
tool_state       (tool_id TEXT PRIMARY KEY, state TEXT, updated_at INTEGER)
notes            (id, title, content, color, pinned, popped_out, window_*, created_at, updated_at, tags)
snippets         (id, title, content, language, tags TEXT, created_at, updated_at)  -- tags = JSON array
history          (id, tool, sub_tab, input, output, timestamp)
api_environments (id, name, base_url, headers, created_at, updated_at)  -- API Client — migration 002
api_collections  (id, name, description, created_at, updated_at)        -- API Client — migration 002
api_requests     (id, collection_id, name, method, url, headers, body, created_at, updated_at)  -- API Client — migration 002
```

WAL mode is set at connection time in `getDb()` — not in migrations.

---

## Submission Checklist

Before opening a PR, verify every item:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `bunx vitest run` — all passing (zero failures)
- [ ] No `Database.load()` outside `src/lib/db.ts`
- [ ] No hardcoded colors (`#hex`, `rgb()`, Tailwind palette classes like `bg-zinc-900`)
- [ ] No `React.StrictMode`
- [ ] No `new WebviewWindow()`
- [ ] No `expose()` from Comlink
- [ ] No `new Worker(..., { type: 'module' })` — use `?worker` imports
- [ ] No `npm`/`yarn` commands
- [ ] New store `init()` has idempotent promise guard
- [ ] New Tauri APIs have permissions in `src-tauri/capabilities/default.json`
- [ ] `applyTheme()` only called inside async init functions
- [ ] Physical pixel APIs (`outerPosition`, `outerSize`) converted via `scaleFactor()`
- [ ] All icons from `@phosphor-icons/react`
