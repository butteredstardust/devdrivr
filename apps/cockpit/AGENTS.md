# AGENTS.md — devdrivr cockpit

Instructions for AI coding agents (OpenAI Codex, GitHub Copilot, etc.) working in `apps/cockpit`.

---

## What This Project Is

**devdrivr cockpit** is a local-first, keyboard-driven developer utility desktop app.

- **Runtime**: Tauri 2 (Rust backend + WKWebView frontend)
- **UI**: React 19 + TypeScript 5.9 + Tailwind CSS 4
- **State**: Zustand 5 stores → SQLite (WAL mode) via `@tauri-apps/plugin-sql`
- **Build**: Vite 7 + Bun (package manager)
- **28 tools** across 7 groups (Code, Data, Web, Convert, Test, Network, Write)
- **No cloud, no accounts** — everything runs locally

---

## Commands (run from `apps/cockpit/`)

```bash
bun install              # install/restore dependencies
bun run tauri dev        # start dev server (Vite + Tauri hot-reload)
bun run clean            # delete node_modules, dist, src-tauri/target
npx tsc --noEmit         # type-check — MUST pass before submitting
bun run test             # run Vitest tests — 604 tests must pass
bun run tauri build      # production build
```

---

## Key Files

| File                                  | Purpose                                 |
| ------------------------------------- | --------------------------------------- |
| `src/app/tool-registry.ts`            | Single source of truth for all tools    |
| `src/app/providers.tsx`               | App bootstrap — stores, window geometry |
| `src/lib/db.ts`                       | All SQLite access via `getDb()`         |
| `src/lib/theme.ts`                    | `applyTheme()`                          |
| `src/stores/*.store.ts`               | Zustand stores                          |
| `src/hooks/useToolState.ts`           | Per-tool state persistence              |
| `src/hooks/useWorker.ts`              | Web Worker RPC wrapper                  |
| `src-tauri/capabilities/default.json` | IPC permissions                         |

---

## Non-Negotiable Rules

### 1. Package manager: Bun only

Never use `npm` or `yarn`.

### 2. DB access: always `getDb()`, never `Database.load()`

### 3. Colors: CSS variables only, never hardcode

Use `var(--color-*)` tokens. Never use `#hex`, `rgb()`, or Tailwind palette classes.

### 4. Web Workers: `?worker` imports only

Never use `new Worker(..., { type: 'module' })`.

### 5. Zustand: selector functions always

```typescript
const theme = useSettingsStore((s) => s.theme) // ✅
const { theme } = useSettingsStore() // ❌
```

### 6. Store init: idempotent promise guard required

```typescript
let initPromise: Promise<void> | null = null
init: async () => {
  if (!initPromise) {
    initPromise = (async () => {
      /* ... */
    })()
  }
  return initPromise
}
```

### 7. Never add `React.StrictMode`

### 8. Never create new Tauri windows (`new WebviewWindow()`)

### 9. DPI conversion for window APIs

```typescript
const factor = await win.scaleFactor()
const pos = (await win.outerPosition()).toLogical(factor)
```

### 10. `applyTheme()` only inside async init functions

### 11. Icons: Phosphor only (`@phosphor-icons/react`)

---

## How to Add a New Tool

**Step 1:** Create `src/tools/<id>/<Name>.tsx`

```typescript
import { useToolState } from '@/hooks/useToolState'
import { useToolAction } from '@/hooks/useToolAction'
import { useUiStore } from '@/stores/ui.store'

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
```

**Step 2:** Register in `src/app/tool-registry.ts`

```typescript
{
  id: 'my-tool',
  name: 'My Tool',
  group: 'convert', // code | data | web | convert | test | network | write
  component: React.lazy(() => import('@/tools/my-tool/MyTool')),
  keywords: ['keyword'],
}
```

---

## How to Add a New Setting

```typescript
// 1. src/types/models.ts — add to AppSettings + DEFAULT_SETTINGS
export type AppSettings = { ..., myNewSetting: boolean }
export const DEFAULT_SETTINGS: AppSettings = { ..., myNewSetting: false }

// 2. src/stores/settings.store.ts — add to persisted object in update()
const settings: AppSettings = { ..., myNewSetting: state.myNewSetting }
```

---

## How to Add a New Worker

```typescript
// src/workers/my.worker.ts
import { handleRpc } from './rpc'
const api = { async process(input: string): Promise<string> { ... } }
export type MyWorker = typeof api
handleRpc(api)

// In tool component:
import MyWorkerFactory from '@/workers/my.worker?worker'
const worker = useWorker<MyWorker>(() => new MyWorkerFactory(), ['process'])
const result = worker ? await worker.process(input) : null
```

---

## TypeScript Strict Mode — Common Traps

```typescript
// noUncheckedIndexedAccess — array access returns T | undefined
const first = items[0]?.name

// exactOptionalPropertyTypes — use {} not { label: undefined }
const t: T = {}

// No any — use unknown
const data = JSON.parse(str) as unknown
```

---

## SQLite Schema

```sql
settings         (key TEXT PRIMARY KEY, value TEXT)  -- JSON values
tool_state       (tool_id TEXT PRIMARY KEY, state TEXT, updated_at INTEGER)
notes            (id, title, content, color, pinned, tags, ...)
snippets         (id, title, content, language, tags, ...)
history          (id, tool, sub_tab, input, output, timestamp)
api_environments (id, name, base_url, headers, ...)
api_collections  (id, name, description, ...)
api_requests     (id, collection_id, name, method, url, headers, body, ...)
```

WAL mode set at connection time in `getDb()` — not in migrations.

---

## Submission Checklist

Before opening a PR, verify:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `bun run test` — 604/604 passing
- [ ] No `Database.load()` outside `src/lib/db.ts`
- [ ] No hardcoded colors (`#hex`, Tailwind palette classes)
- [ ] No `React.StrictMode`
- [ ] No `new WebviewWindow()`
- [ ] No `new Worker(..., { type: 'module' })` — use `?worker`
- [ ] No `npm`/`yarn` commands
- [ ] New store `init()` has idempotent promise guard
- [ ] New Tauri APIs have permissions in `capabilities/default.json`
- [ ] `applyTheme()` only inside async init functions
- [ ] Physical pixel APIs converted via `scaleFactor()`
- [ ] All icons from `@phosphor-icons/react`
