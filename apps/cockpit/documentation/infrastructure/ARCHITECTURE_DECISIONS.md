# ARCHITECTURE DECISIONS — devdrivr cockpit

> The _why_ behind every non-obvious technical choice. Read this before undoing anything that seems wrong — it was probably deliberate.

---

## ADR-001: Comlink removed — replaced with custom `handleRpc` / `useWorker`

**Status:** Accepted
**Date:** 2025

### Context

All worker-backed tools (Code Formatter, Diff Viewer, TypeScript Playground, XML Tools, JSON Tools) were silently failing. The root cause was traced to Tauri's WKWebView (WebKit on macOS).

Comlink uses JavaScript's `Proxy` API to intercept property access on the wrapped Worker object. In Tauri's WebKit-based WebView, `Proxy` property access returns `undefined` — the `wrap()` call succeeds, but calling any method on the returned object fails with "is not a function".

### Decision

Replace Comlink entirely with a plain `postMessage`/`onmessage` RPC protocol:

- **Worker-side:** `handleRpc(api)` in `src/workers/rpc.ts` — registers a single `onmessage` handler that dispatches by method name and posts back `{ id, result }` or `{ id, error }`.
- **Main-thread:** `useWorker<T>(factory, methods)` in `src/hooks/useWorker.ts` — builds a real plain object (no Proxy) with one function per method name.

### Consequences

- No Proxy, no Comlink anywhere in the codebase.
- Every worker call must explicitly list method names in `useWorker(factory, ['method1', 'method2'])`.
- Workers must end with `handleRpc(api)`, not `expose(api)`.
- The `comlink` package remains in `package.json` but is not used.

### Do not revert

Reverting to Comlink will silently break all worker tools on macOS (and any WebKit-based runtime) without an obvious error.

---

## ADR-002: `?worker` Vite imports — no `new URL(..., { type: 'module' })`

**Status:** Accepted
**Date:** 2025

### Context

Workers were originally imported as module workers:

```typescript
new Worker(new URL('./formatter.worker.ts', import.meta.url), { type: 'module' })
```

This pattern relies on the browser supporting ES module workers (`{ type: 'module' }`). Tauri's WKWebView does not reliably support module workers — the worker context fails to initialise or imports resolve incorrectly.

### Decision

All worker imports use Vite's `?worker` suffix:

```typescript
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
const worker = new FormatterWorkerFactory()
```

Vite bundles the worker and all its dependencies into a self-contained blob URL at build time. This produces a classic worker (no `{ type: 'module' }` required) that works in any WebView context.

### Consequences

- Workers are bundled eagerly at build time (no code-splitting benefit for worker deps, but correctness wins).
- Every new worker file needs a corresponding `?worker` import in its consumer.
- The `new URL(..., { type: 'module' })` pattern is banned (pre-commit hook checks for it).

---

## ADR-003: `prettier-plugin-sql` removed — replaced with `sql-formatter`

**Status:** Accepted
**Date:** 2025

### Context

`prettier-plugin-sql` depends on `node-sql-parser`, which is distributed as CJS/UMD. When imported inside an ESM worker, the module loader throws a parse error because the CJS format uses `require()` / `module.exports` which are not valid in ESM scope.

### Decision

SQL formatting uses `sql-formatter` (ESM-native) directly inside the formatter worker:

```typescript
import { format as formatSql } from 'sql-formatter'
// SQL bypasses Prettier entirely
if (options.language === 'sql') {
  return formatSql(code, { tabWidth: options.tabWidth ?? 2 })
}
```

### Consequences

- SQL formatting output may differ slightly from Prettier's style (sql-formatter has its own opinionated output).
- `prettier-plugin-sql` remains in `package.json` for now but is not imported in the worker.

---

## ADR-004: `React.StrictMode` intentionally absent

**Status:** Accepted
**Date:** 2025

### Context

React StrictMode mounts every component twice (in development) to surface side-effect bugs. In Tauri's WebView, this causes a visible flash on startup because:

1. `providers.tsx` runs window geometry restore and store init on mount.
2. The double-mount fires the restore sequence twice, causing a momentary incorrect window geometry before the second mount corrects it.

### Decision

`React.StrictMode` was removed from `src/main.tsx` and must not be re-added.

### Consequences

- Side-effect bugs that StrictMode would catch (non-idempotent effects, stale closures) will not surface in development. Developers must be careful.
- The `init()` idempotent promise guard (ADR-007) mitigates the most dangerous category of this.

---

## ADR-005: No new Tauri windows (`WebviewWindow`)

**Status:** Accepted
**Date:** 2025

### Context

An earlier version of the app created floating note windows using `new WebviewWindow(...)`. This was removed because:

1. **IPC capability scoping:** Tauri 2 capabilities are scoped per window by name. Adding a new window requires duplicating the entire capability set or accepting a reduced permission set.
2. **Listener leaks:** Window-scoped event listeners (`appWindow.listen(...)`) were not consistently cleaned up when windows were closed, causing stale callbacks.
3. **State sync complexity:** Synchronising Zustand store state across multiple windows over IPC adds significant complexity for marginal UX benefit.

### Decision

All UI interactions happen within the single `main` window. Floating content uses drawers (`NotesDrawer`), slide-in panels (`SettingsPanel`), and modals (`ShortcutsModal`, `CommandPalette`).

### Consequences

- Notes cannot be "popped out" to independent OS windows (the `popped_out` and `window_*` columns remain in the DB schema as tombstones of the old behaviour).
- All content must fit within a resizable single window.

---

## ADR-006: SQLite WAL mode set at connection time, not in migrations

**Status:** Accepted
**Date:** 2025

### Context

SQLite's WAL (Write-Ahead Logging) mode is set via `PRAGMA journal_mode=WAL`. This pragma is persistent for a given database file — but only if set before any transaction that creates the schema.

The Tauri SQL plugin runs migrations inside a transaction. If `PRAGMA journal_mode=WAL` is placed inside a migration file, the journal mode change is deferred until after the transaction commits. In practice this means the very first run (fresh install, schema creation) does not benefit from WAL mode.

### Decision

WAL mode is set immediately after the DB connection is established, in `getDb()` in `src/lib/db.ts`, before any migration or query runs.

### Consequences

- Migrations cannot control journal mode.
- Any code that calls `Database.load()` directly (bypassing `getDb()`) will not have WAL mode set, potentially causing write contention.
- This is one reason `Database.load()` is banned outside `src/lib/db.ts`.

---

## ADR-007: Idempotent store init with module-level promise guard

**Status:** Accepted
**Date:** 2025

### Context

`providers.tsx` calls `store.init()` sequentially on startup. React's rendering can cause a component to attempt to read from a store before `init()` completes. Without a guard, concurrent `init()` calls would fire multiple DB queries and potentially race to overwrite state.

### Decision

Every store `init()` must use a module-level promise guard:

```typescript
let initPromise: Promise<void> | null = null

init: async () => {
  if (!initPromise) {
    initPromise = (async () => {
      /* DB queries, set state */
    })()
  }
  return initPromise
}
```

This ensures:

- The first call fires the async work.
- All subsequent calls (concurrent or sequential) await the same promise.
- No double-execution, no races.

### Consequences

- Store state is available synchronously after `init()` resolves (guaranteed single write).
- If `init()` throws, the promise rejects — `providers.tsx` catches this and renders an error state.
- New stores **must** implement this pattern; the pre-commit hook checks for it.

---

## ADR-008: CSS custom properties for all colours — no Tailwind palette classes

**Status:** Accepted
**Date:** 2025

### Context

The app supports dark and light themes, switchable at runtime by toggling a `.light` class on `<html>`. Tailwind's built-in palette classes (e.g., `bg-zinc-900`, `text-white`) are static — they don't respond to a runtime class switch.

CSS custom properties (`var(--color-*)`) are defined under `:root` (dark, default) and `.light` (overrides), so they update automatically when the class changes.

### Decision

All colours are expressed as CSS custom property tokens:

```typescript
className = 'bg-[var(--color-surface)] text-[var(--color-text)]'
```

Never hardcode hex values, rgb(), or Tailwind palette utilities.

### Token inventory

| Token                    | Dark            | Light           | Semantic use                          |
| ------------------------ | --------------- | --------------- | ------------------------------------- |
| `--color-bg`             | #0a0a0a         | #faf8f0         | Main window background                |
| `--color-surface`        | #181818         | #f5f3eb         | Card, panel, sidebar                  |
| `--color-surface-raised` | #1e1e1e         | #ffffff         | Modals, dropdowns, tooltips           |
| `--color-surface-hover`  | #282828         | #ece9e0         | Hover state backgrounds               |
| `--color-border`         | #333333         | #d4d0c8         | All borders and dividers              |
| `--color-text`           | #e0e0e0         | #1a1a1a         | Primary body text                     |
| `--color-text-muted`     | #888888         | #666666         | Secondary / dimmed text               |
| `--color-accent`         | #39ff14         | #00875a         | Brand colour, interactive highlights  |
| `--color-accent-dim`     | #1a7a0a         | #b3e0d0         | Accent with low opacity (hover fills) |
| `--color-error`          | #ef4444         | #dc2626         | Errors, destructive actions           |
| `--color-warning`        | #f59e0b         | #d97706         | Warnings                              |
| `--color-success`        | #22c55e         | #16a34a         | Success states                        |
| `--color-info`           | #3b82f6         | #2563eb         | Informational                         |
| `--color-shadow`         | rgba(0,0,0,0.4) | rgba(0,0,0,0.1) | Box shadows                           |

### Consequences

- Theme switching is zero-JS (just a class toggle on `<html>`).
- `applyTheme()` must only be called inside async `init()` functions to avoid a flash before the DB-persisted theme is loaded (the `index.html` inline script handles the synchronous pre-load from `localStorage`).

---

## ADR-009: `getDb()` — single connection singleton

**Status:** Accepted
**Date:** 2025

### Context

`@tauri-apps/plugin-sql` creates a new connection pool each time `Database.load()` is called. Multiple concurrent calls from different stores during init would create multiple pools, each running their own WAL pragma and potentially their own migration pass. This caused intermittent migration-already-applied errors in testing.

### Decision

`getDb()` in `src/lib/db.ts` wraps `Database.load()` in a module-level promise singleton. The first call loads the database (and sets WAL mode); subsequent calls return the already-loaded instance.

### Consequences

- All DB access must go through `getDb()`. Direct `Database.load()` calls elsewhere are banned.
- The ban is enforced by the pre-commit hook and documented in AGENTS.md, GEMINI.md, and CLAUDE.md.

---

## ADR-010: DPI / Retina — always convert physical pixels to logical

**Status:** Accepted
**Date:** 2025

### Context

Tauri's `window.outerPosition()` and `window.outerSize()` return _physical_ pixels. On a Retina display with `devicePixelRatio` of 2, physical pixels are twice the logical pixel value. If saved raw and restored, the window appears at double its intended size/position.

### Decision

Always call `scaleFactor()` and convert before saving:

```typescript
const factor = await win.scaleFactor()
const pos = (await win.outerPosition()).toLogical(factor)
const sz = (await win.outerSize()).toLogical(factor)
```

Save the logical values. On restore, pass them directly to `setPosition`/`setSize` (Tauri accepts logical pixels for these setters).

### Consequences

- Forgetting this conversion causes incorrect geometry on Retina/HiDPI displays (positions doubled, windows off-screen).
- The pre-commit hook checks for raw `outerPosition`/`outerSize` calls without a nearby `scaleFactor()` call.

---

## ADR-011: Zustand selector functions — never spread the store

**Status:** Accepted
**Date:** 2025

### Context

Zustand v5 re-renders a component whenever the selected value changes (by reference equality). If the entire store is destructured (`const { theme, sidebar } = useStore()`), the component subscribes to the _entire_ store and re-renders on any state change, regardless of whether the consumed values changed.

### Decision

Always use selector functions:

```typescript
// ✅ Re-renders only when 'theme' changes
const theme = useSettingsStore((s) => s.theme)

// ❌ Re-renders on every store change
const { theme } = useSettingsStore()
```

### Consequences

- Components are render-efficient by default.
- When multiple values from one store are needed, write separate selectors or a combined selector that returns a stable reference.

---

## ADR-012: Tool state via `useToolState` — in-memory cache + debounced SQLite write

**Status:** Accepted
**Date:** 2025

### Context

Tools persist their UI state (input text, selected options, output) so that switching away and returning restores the previous state. Early implementations wrote directly to SQLite on every keystroke, which caused jank (each write round-trips through Tauri IPC → Rust → SQLite).

### Decision

`useToolState` implements a two-tier persistence strategy:

1. **In-memory cache** (`src/stores/tool-state.store.ts`): writes are synchronous and instant.
2. **Debounced SQLite write**: batched 2 seconds after the last update.
3. **Immediate flush on unmount**: the component's cleanup effect writes any pending state before the tool is unmounted, ensuring no data is lost on rapid tool switching.

### Consequences

- Tool state is always current in memory (no read-from-DB on switch if cache is populated).
- A crash within the 2-second debounce window could lose the last keystrokes — acceptable trade-off.
- The `toolId` passed to `useToolState` **must exactly match** the `id` in `tool-registry.ts`, or state will not be found in the cache on switch-back.
