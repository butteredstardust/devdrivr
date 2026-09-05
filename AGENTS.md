# AGENTS.md — devdrivr

Use this contract when you work in this repository.

## Development Workflow

For a feature or update, complete this workflow without pausing for routine permission:

1. **Evaluate & refine** — Read relevant code first. State tradeoffs, ambiguities, and edge cases that need attention.
2. **Plan** — Agree the approach before you change code. Write steps for non-trivial work.
3. **Implement** — Make the requested update. Do not add unrequested features, abstractions, or cleanup.
4. **Verify** — Run `npx tsc --noEmit` with zero errors. Run `bunx vitest run` with all tests passing. Fix failures first.
5. **Code review** — Review the update against this file. Check for bugs, anti-patterns, and regressions.
6. **Fix** — Resolve every review finding before you commit.
7. **Commit & push** — Use a conventional commit message on a feature branch.
8. **Open PR** — Write for a human reviewer. Use user-facing language, not a development log.

Work independently through all eight steps. Use best practice and the rules below. Pause only for a genuine intent ambiguity.

---

## Git Workflow

### Never commit directly to main

Use a feature branch for all work. If commits reach `main` before you create a branch, rescue them before you push:

```bash
git checkout -b feat/my-feature   # branch at current HEAD — captures the commits
git checkout main
git reset --hard origin/main      # strip the commits off main
git push -u origin feat/my-feature
```

### Branch naming

```
feat/short-description       # new feature or enhancement
fix/short-description        # bug fix
docs/short-description       # documentation only
chore/short-description      # tooling, deps, config
refactor/short-description   # no behaviour change
```

### Commit messages — conventional commits

Use `type(scope): short description`. Use imperative mood. Do not add a period. Keep it under 72 chars. The scope is almost always `devdrivr`.

```
feat(devdrivr): add cron expression parser
fix(devdrivr): resolve tag filter losing focus on blur
docs(devdrivr): update AGENTS.md with git workflow
```

### Commits run a `bunx` pre-commit hook

The pre-commit hook calls `bunx`. Make `bun` available to the environment that runs Git hooks. Normally, `git commit -m "..."` works.

If a commit reports `command not found: bunx`, the hook PATH does not include Bun. For Homebrew Bun on macOS, use `/opt/homebrew/bin` for that command:

```bash
HUSKY_PATH=/opt/homebrew/bin PATH="/opt/homebrew/bin:$PATH" git commit -m "..."
```

Use the output of `dirname "$(which bun)"` when Bun is elsewhere. This prefix fixes a local environment gap. Do not use it unless the error occurs.

### PRs

- Title: Match the commit message format. Keep it under 70 chars.
- Body: Use **Summary** bullets in user-facing language. Add a **Test plan** checklist.
- Target: Use `main`.
- New branches: Push with `-u`: `git push -u origin feat/my-feature`.
- Never force-push to `main`.

For “open a PR” or “commit and push,” create a branch if needed. Commit, push, then run `gh pr create`. Do not ask between these steps.

---

## What This Project Is

**devdrivr** is a local-first, keyboard-driven desktop workspace for developer tools.

- **Runtime**: Tauri 2 (Rust backend + WKWebView frontend)
- **UI**: React 19 + TypeScript 5.9 + Tailwind CSS 4
- **State**: Zustand 5 stores → SQLite (WAL mode) via `@tauri-apps/plugin-sql`
- **Build**: Vite 7 + Bun (package manager)
- **31 registered tools** across 7 groups (Code, Data, Web, Convert, Test, Network, Write)
- **No cloud, no accounts** — everything runs locally

---

## Commands

Run every command from the repository root.

```bash
# Typecheck — zero errors required before every commit
bunx tsc --noEmit

# Tests — invoke vitest through bunx
bunx vitest run        # run once
bunx vitest            # watch mode

# Lint
bun run lint

# Dev server (Vite + Tauri hot-reload) — this is what opens the desktop app
bun run tauri dev

# Vite-only web preview (no Tauri shell, native APIs are stubbed with canned data)
bun run dev

# Dev + a browser-drivable copy of the running app at http://127.0.0.1:9090, with real IPC —
# real database, real filesystem, real MCP server. Use this when a bug needs a browser you can
# automate, since macOS WKWebView exposes no CDP endpoint.
# See documentation/REMOTE_UI_HARNESS.md, and documentation/HARNESSES.md for which harness to pick.
bun run dev:remote

# Production build
bun run tauri build

# Install / restore dependencies
bun install

# Clean build artifacts and node_modules
bun run clean
```

If a command reports `command not found`, check [Commits run a `bunx` pre-commit hook](#commits-run-a-bunx-pre-commit-hook).

### Common mistakes

| Wrong                                      | Right                                      | Why                                                |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| `bun run test`                             | `bunx vitest run`                          | Bun cannot resolve the Vitest binary directly      |
| `npm run ...` / `yarn ...`                 | `bun run ...`                              | npm and yarn are not the package manager           |
| Committing when the hook can't find `bunx` | Put Bun's bin dir on PATH for that command | Hook shells can have a minimal PATH. See § Commits |

---

## File Map — Know Before You Touch

The `@/` alias maps to `src/`. Use it for every import. Do not use relative paths such as `../../lib/db`.

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
const db = await Database.load('sqlite:devdrivr.db')
```

### 3. Colors: CSS variables only, never hardcode

```typescript
// ✅
className="bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]"

// ❌ Breaks dark/light theme switching
className="bg-zinc-900 text-white border-gray-700"
style={{ color: '#39ff14' }}
```

Use these tokens: `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`,
`--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-dim`, `--color-error`,
`--color-warning`, `--color-success`, `--color-info`, `--color-shadow`.

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

Do not add it. It causes a double-mount flash in Tauri's WebView.

### 9. Never create new Tauri windows

Do not use `new WebviewWindow(...)`. It causes IPC capability-scoping and listener-leak issues.
Use drawers, panels, or modals in the existing window.

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

This is a Tauri desktop app. Browser preview cannot render it.
Do not call `preview_start` or a preview tool unless the user explicitly asks.

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

`onWheel` in JSX cannot call `e.preventDefault()` because the browser ignores it. Attach an imperative listener for zoom or scroll-hijack:

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

In a conditional JSX branch, `useRef` can be `null` when `useEffect` runs on mount. Use a `useCallback` callback ref. It attaches and removes the listener as the node mounts and unmounts:

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

`ResizeObserver` is `undefined` in Vitest/jsdom. Always add this guard:

```typescript
if (typeof ResizeObserver === 'undefined') return
const observer = new ResizeObserver(update)
observer.observe(el)
return () => observer.disconnect()
```

### 18. Cross-tool navigation — hand off with `sendToTool`

Use `sendToTool` to pre-populate a destination tool and open it:

```typescript
import { sendToTool } from '@/lib/tool-handoff'

sendToTool('target-tool', {
  draft: {
    /* ... */
  },
})
```

Do **not** write to `useToolStateCache.set` and call `openTab` by hand. A tool can be open in multiple tabs. Address the receiving tab state key, not the tool id. Mounted tabs do not re-read the cache. `sendToTool` resolves the key and uses `seed()`. A mounted `useToolState` watches this signal.

### 19. Canvas 2D is sufficient for image processing

Do not add an npm image library for resize, crop, format conversion, or quality control. Canvas handles these operations:

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

For large images, debounce input that triggers `toDataURL`/`toBlob` on every keystroke.

### 20. Crop / geometry math — clamp dimensions before position

Clamp `w` and `h` before `x` and `y` for a crop or selection rectangle. This keeps `origW - w` and `origH - h` valid:

```typescript
w = Math.max(1, Math.min(w, origW))
h = Math.max(1, Math.min(h, origH))
x = Math.max(0, Math.min(x, origW - w))
y = Math.max(0, Math.min(y, origH - h))
```

Lower-bound new `x` and `y` from a drag delta before deriving `w` and `h`. Example: NW/SW handle drag uses `nx = Math.max(0, startX + dx)`.

### 21. Fuse.js search highlighting — use composite React keys

With `includeMatches: true`, define this local interface. Do not import Fuse types:

```typescript
interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}
```

Keep two memos. `fuseResults` drives the filtered list and match data. Use `matchMap: Map<id, ReadonlyArray<FuseMatchEntry>>`.

Use composite keys on `<mark>` elements: `key={\`${start}-${end}\`}`, not `key={start}`. Fuse can return overlapping ranges with one `start` value. This causes duplicate-key warnings.

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

Do not set a pixel height. The outer div transitions the row size. Inner `overflow-hidden` clips content. The toggle button must have `aria-expanded={!collapsed}`.

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

`e.preventDefault()` on `onMouseDown` keeps input focus when a suggestion is clicked. Prefix async `onMouseDown` handlers with `void`. Without it, an unhandled promise rejection occurs.

### 24. `void` prefix for async fire-and-forget event handlers

### 25. DB migrations — always backfill existing rows

`ALTER TABLE` gives existing rows `NULL` for a new column. Include an explicit `UPDATE` in the same migration. Do not rely on `DEFAULT` for existing data:

```sql
-- ✅ Column added AND existing rows backfilled in same migration
ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';
UPDATE snippets SET folder = '' WHERE folder IS NULL;

-- ❌ Existing rows are NULL even with DEFAULT — causes runtime errors on existing installs
ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';
```

### 26. Tailwind v4 — no config file

This project uses CSS-first Tailwind CSS 4. Do not create `tailwind.config.js`. Keep configuration in `src/index.css`. Do not use `@apply` with v3 plugin syntax. Use standard arbitrary values: `bg-[var(--color-surface)]`, `grid-rows-[0fr]`.

### 27. Prefer platform APIs over npm packages

Use browser and web platform APIs before you add a dependency:

| Task                       | Use this                    | Not this                 |
| -------------------------- | --------------------------- | ------------------------ |
| Image resize/crop/compress | Canvas 2D API               | `sharp`, `jimp`          |
| Hashing                    | `crypto.subtle`             | `crypto-js`              |
| UTF-8 encode/decode        | `TextEncoder`/`TextDecoder` | `buffer` polyfill        |
| HTML/XML parsing           | `DOMParser`                 | `cheerio`, `htmlparser2` |

Use a browser API when it handles the task. Add a package only when the platform API is insufficient.

### 28. Test file location

Put tool tests in `src/tools/__tests__/<tool-id>.test.tsx`. Do not colocate them with the component. `src/tools/my-tool/MyTool.test.tsx` works but breaks the project pattern.

```
src/tools/__tests__/
  snippets.test.tsx
  api-client.test.tsx
  markdown-editor.test.tsx
```

Prefix an async function called by a synchronous event handler with `void`. Without it, an unhandled rejection warning occurs:

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
snippets         (id, title, content, language, tags TEXT, folder TEXT, created_at, updated_at)  -- tags = JSON array; folder added migration 005
history          (id, tool, sub_tab, input, output, timestamp)
api_environments (id, name, base_url, headers, created_at, updated_at)  -- API Client — migration 002
api_collections  (id, name, description, created_at, updated_at)        -- API Client — migration 002
api_requests     (id, collection_id, name, method, url, headers, body, created_at, updated_at)  -- API Client — migration 002
```

Set WAL mode at connection time in `getDb()`. Do not set it in migrations.

---

## Submission Checklist

Before you open a PR, validate every item:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `bunx vitest run` — all passing (zero failures)
- [ ] `bun run lint` — zero errors (warnings tolerated up to threshold)
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
