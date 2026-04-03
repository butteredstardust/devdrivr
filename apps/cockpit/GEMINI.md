# GEMINI.md — devdrivr cockpit

Instructions for Gemini CLI working in `apps/cockpit`.

---

## What This Project Is

**devdrivr cockpit** is a local-first, keyboard-driven developer utility desktop app.
- **Runtime**: Tauri 2 (Rust backend + WKWebView frontend)
- **UI**: React 19 + TypeScript 5.9 + Tailwind CSS 4
- **State**: Zustand 5 stores → SQLite (WAL mode) via `@tauri-apps/plugin-sql`
- **Build**: Vite 7 + Bun (package manager)
- **27 tools** across 7 groups (Code, Data, Web, Convert, Test, Network, Write)
- **No cloud, no accounts** — everything runs locally

---

## Commands (always run from `apps/cockpit/`)

```bash
bun install              # install/restore dependencies
bun run tauri dev        # start dev server (Vite + Tauri hot-reload)
bun run clean            # delete node_modules, dist, src-tauri/target
npx tsc --noEmit         # type-check — MUST pass before submitting
bun run test             # run Vitest tests — MUST all pass
bun run tauri build      # production build
```

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
applyTheme('system')  // at module level
```

### 12. Icons: Phosphor only
```typescript
// ✅
import { ArrowRight, Clipboard } from '@phosphor-icons/react'
<ArrowRight size={16} weight="bold" />

// ❌ No emoji, no inline SVG, no other icon libraries
<span>→</span>
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
  }
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

## Documentation

Full canonical docs live in [`documentation/`](./documentation/):

| Doc | When to read |
|-----|-------------|
| [`documentation/PRODUCT_MAP.md`](./documentation/PRODUCT_MAP.md) | **Check first** — product status, all 27 tools, shortcuts |
| [`documentation/infrastructure/DIRECTORY_MAP.md`](./documentation/infrastructure/DIRECTORY_MAP.md) | Finding any file fast |
| [`documentation/infrastructure/CODING_PATTERNS.md`](./documentation/infrastructure/CODING_PATTERNS.md) | Before writing any code |
| [`documentation/infrastructure/TROUBLESHOOTING.md`](./documentation/infrastructure/TROUBLESHOOTING.md) | When something breaks |

---

## Submission Checklist

Before opening a PR, verify every item:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `bun run test` — 252/252 passing
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
