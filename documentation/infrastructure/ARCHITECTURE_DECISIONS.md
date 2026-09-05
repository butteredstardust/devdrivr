# ARCHITECTURE DECISIONS — devdrivr

> This document records non-obvious technical choices, their rejected alternatives, and their consequences.

---

## ADR-001: Comlink removed — replaced with custom `handleRpc` / `useWorker`

**Status:** Accepted
**Date:** 2025

### Context

Worker-backed tools need RPC that works in Tauri's WKWebView. Comlink `Proxy` property access returns `undefined` there.

### Decision

The app uses plain `postMessage` and `onmessage` RPC instead of Comlink:

- **Worker-side:** `handleRpc(api)` in `src/workers/rpc.ts` — registers a single `onmessage` handler that dispatches by method name and posts back `{ id, result }` or `{ id, error }`.
- **Main-thread:** `useWorker<T>(factory, methods)` in `src/hooks/useWorker.ts` — builds a real plain object (no Proxy) with one function per method name.

### Consequences

- The app uses no Comlink or Proxy.
- Every worker call lists methods in `useWorker(factory, ['method1', 'method2'])`.
- Workers end with `handleRpc(api)`, not `expose(api)`.
- The `comlink` package remains in `package.json` but the app does not use it.

### Do not revert

Reject Comlink. It breaks worker tools in WebKit-based runtimes without a clear error.

---

## ADR-002: `?worker` Vite imports — no `new URL(..., { type: 'module' })`

**Status:** Accepted
**Date:** 2025

### Context

Module worker imports require support for ES module workers:

```typescript
new Worker(new URL('./formatter.worker.ts', import.meta.url), { type: 'module' })
```

Tauri's WKWebView does not reliably support them. Worker initialization or imports can fail.

### Decision

The app uses Vite `?worker` imports:

```typescript
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
const worker = new FormatterWorkerFactory()
```

Vite bundles the worker and its dependencies as a blob URL at build time. This creates a classic worker that works in WebView contexts.

### Consequences

- Workers bundle eagerly at build time.
- Each worker file needs a matching `?worker` import in its consumer.
- Reject `new URL(..., { type: 'module' })`. The pre-commit hook checks for it.

---

## ADR-003: `prettier-plugin-sql` removed — replaced with `sql-formatter`

**Status:** Accepted
**Date:** 2025

### Context

`prettier-plugin-sql` depends on CJS/UMD `node-sql-parser`. Its `require()` and `module.exports` fail in an ESM worker.

### Decision

The formatter worker uses ESM-native `sql-formatter` for SQL:

```typescript
import { format as formatSql } from 'sql-formatter'
// SQL bypasses Prettier entirely
if (options.language === 'sql') {
  return formatSql(code, { tabWidth: options.tabWidth ?? 2 })
}
```

### Consequences

- SQL output can differ from Prettier style.
- `prettier-plugin-sql` remains in `package.json` but is not imported by the worker.

---

## ADR-004: `React.StrictMode` intentionally absent

**Status:** Accepted
**Date:** 2025

### Context

React StrictMode mounts components twice in development. In Tauri's WebView, this flashes at startup:

1. `providers.tsx` runs window geometry restore and store init on mount.
2. The second mount repeats restoration and shows incorrect geometry briefly.

### Decision

The app excludes `React.StrictMode` from `src/main.tsx`.

### Consequences

- Development does not expose some side-effect bugs that StrictMode detects.
- The `init()` promise guard in ADR-007 limits the highest-risk case.

---

## ADR-005: No new Tauri windows (`WebviewWindow`)

**Status:** Accepted
**Date:** 2025

### Context

New `WebviewWindow(...)` instances create these problems:

1. **IPC capability scoping:** Tauri 2 capabilities are scoped per window by name. Adding a new window requires duplicating the entire capability set or accepting a reduced permission set.
2. **Listener leaks:** Window-scoped `appWindow.listen(...)` listeners can retain stale callbacks.
3. **State sync complexity:** IPC synchronization across Zustand stores adds complexity.

### Decision

The app uses one `main` window. It uses drawers, slide-in panels, and modals for floating content.

### Consequences

- Notes do not open in independent OS windows. The schema retains `popped_out` and `window_*` columns.
- All content fits in one resizable window.

---

## ADR-006: SQLite WAL mode set at connection time, not in migrations

**Status:** Accepted
**Date:** 2025

### Context

SQLite sets WAL with `PRAGMA journal_mode=WAL`. The database needs it before schema creation transactions.
The Tauri SQL plugin runs migrations in a transaction. A migration cannot enable WAL before that transaction.

### Decision

The app sets WAL in `getDb()` in `src/lib/db.ts` after connection and before migrations or queries.

### Consequences

- Migrations do not control journal mode.
- Direct `Database.load()` calls bypass WAL and can cause write contention.
- Reject `Database.load()` outside `src/lib/db.ts`.

---

## ADR-007: Idempotent store init with module-level promise guard

**Status:** Accepted
**Date:** 2025

### Context

`providers.tsx` initializes stores at startup. Concurrent `init()` calls can run duplicate queries and race state writes.

### Decision

Every store `init()` uses this module-level promise guard:

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

The guard provides these results:

- The first call runs asynchronous work.
- Later calls await the same promise.
- Initialization does not run twice or race.

### Consequences

- State is available after `init()` resolves.
- If `init()` throws, the promise rejects. `providers.tsx` renders an error state.
- New stores use this pattern. The pre-commit hook checks it.

---

## ADR-008: CSS custom properties for all colours — no Tailwind palette classes

**Status:** Accepted
**Date:** 2025

### Context

The app switches dark and light themes by toggling `.light` on `<html>`. Tailwind palette classes do not change at runtime.
CSS custom properties under `:root` and `.light` update when the class changes.

### Decision

The app expresses all colors as CSS custom property tokens:

```typescript
className = 'bg-[var(--color-surface)] text-[var(--color-text)]'
```

Reject hardcoded hex values, rgb(), and Tailwind palette utilities.

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

- Theme switching needs only a class toggle on `<html>`.
- Call `applyTheme()` only in async `init()` functions. The `index.html` script pre-loads from `localStorage`.

---

## ADR-009: `getDb()` — single connection singleton

**Status:** Accepted
**Date:** 2025

### Context

`@tauri-apps/plugin-sql` creates a connection pool for each `Database.load()` call. Concurrent store initialization can create multiple pools, WAL calls, and migration passes.

### Decision

`getDb()` in `src/lib/db.ts` wraps `Database.load()` in a module-level promise singleton. The first call loads the database and sets WAL. Later calls return that instance.

### Consequences

- All database access goes through `getDb()`. Reject direct `Database.load()` calls.
- The pre-commit hook checks this rule. AGENTS.md, GEMINI.md, and CLAUDE.md document it.

---

## ADR-010: DPI / Retina — always convert physical pixels to logical

**Status:** Accepted
**Date:** 2025

### Context

Tauri `window.outerPosition()` and `window.outerSize()` return physical pixels. On a Retina display with `devicePixelRatio` 2, they are twice logical values.

### Decision

The app calls `scaleFactor()` and converts values before saving:

```typescript
const factor = await win.scaleFactor()
const pos = (await win.outerPosition()).toLogical(factor)
const sz = (await win.outerSize()).toLogical(factor)
```

The app saves logical values. It passes them directly to `setPosition` and `setSize` during restore.

### Consequences

- Raw values cause incorrect geometry on Retina and HiDPI displays.
- The pre-commit hook checks for raw calls without a nearby `scaleFactor()` call.

---

## ADR-011: Zustand selector functions — never spread the store

**Status:** Accepted
**Date:** 2025

### Context

Zustand v5 updates a component when its selected value changes by reference. Destructuring the store subscribes the component to every state change.

### Decision

The app uses selector functions:

```typescript
// ✅ Re-renders only when 'theme' changes
const theme = useSettingsStore((s) => s.theme)

// ❌ Re-renders on every store change
const { theme } = useSettingsStore()
```

### Consequences

- Components update only for selected state.
- Use separate selectors or a combined selector with a stable reference for multiple values.

---

## ADR-012: Tool state via `useToolState` — in-memory cache + debounced SQLite write

**Status:** Accepted
**Date:** 2025

### Context

Tools persist input, options, and output to restore state after a tool switch. SQLite writes for every keystroke create IPC and database overhead.

### Decision

`useToolState` uses two persistence levels:

1. **In-memory cache** (`src/stores/tool-state.store.ts`): writes are synchronous.
2. **Debounced SQLite write**: writes run 2 seconds after the last update.
3. **Immediate flush on unmount**: cleanup writes pending state before a tool unmounts.

### Consequences

- Memory holds current tool state when the cache has state.
- A crash inside the 2-second delay can lose the last keystrokes.
- `toolId` in `useToolState` exactly matches `id` in `tool-registry.ts`.

---

## ADR-013: Atomic batch writes go through a Rust command, not JS `BEGIN`/`COMMIT`

**Status:** Accepted
**Date:** 2026

### Context

`runTransaction` sends `BEGIN`, statements, and `COMMIT` through separate `conn.execute()` calls.
It serves `saveNotesOrder`, `saveUserPromptTemplates`, `seedBuiltinPromptTemplates`, and `saveApiImport`.

`tauri-plugin-sql` 2.3.2 uses `DbPool::Sqlite(Pool<Sqlite>)` from `Pool::connect(...)`. The sqlx default is **10 max connections**.
Each `pool.execute(query)` call can use a different connection. `BEGIN`, writes, and `COMMIT` lack connection affinity:

- Writes can auto-commit individually, leaving partial results.
- `COMMIT` without an open transaction errors. Catch-block `ROLLBACK` can do nothing.
- An open `BEGIN IMMEDIATE` can remain on a pooled connection. Later writes can fail until restart.

The JS `writeQueue` serializes writes but does not ensure connection affinity. The Rust MCP service uses `max_connections(1)`.

### Decision

Batch writes use the Tauri `db_execute_batch` command in `src-tauri/src/batch.rs`. It owns a dedicated `max_connections(1)` SQLite pool with WAL and a 5s busy timeout.
It runs each batch in one transaction on one connection. Statements use `{ sql, params }` pairs.
sqlx binds JSON parameters with the plugin scalar mapping. `immediate` selects `BEGIN IMMEDIATE` for `saveNotesOrder`.

JS uses `runBatch(statements, immediate)` instead of `runTransaction`. It uses `enqueueWrite` to preserve ordering with plugin writes.
`getDb()` opens the database and applies migrations before the Rust pool uses the file.

Rejected alternatives:

- **Single multi-statement SQL string.** `conn.execute` parameterizes each statement. Concatenation would inline user content into SQL and increase injection risk.
- **Remove the wrapper and make batches idempotent.** The four batches use idempotent upserts. Partial reorder and incomplete imports remain visible wrong states.

### Consequences

- Batches are all-or-nothing. A failure rejects with the Rust error and leaves no partial rows.
- JS does not emit `BEGIN`, `COMMIT`, or `ROLLBACK`. Future batch writers use `runBatch`.
- The plugin, batch pool, and MCP service write `cockpit.db`. WAL, the 5s timeout, and `writeQueue` manage contention.
- `saveUserPromptTemplate`, `saveApiCollection`, and `saveApiRequest` use the plugin pool. Single statements are atomic.
- `getSetting`, `loadNotes`, `loadSnippets`, `loadHistory`, `loadToolState`, and API loaders use the plugin pool. They are individual `SELECT` calls.

---

## ADR-014: Tauri npm packages are pinned to the same minor as their Rust crates

**Status:** Accepted
**Date:** 2026-09-02

### Context

The Tauri CLI rejects builds when a `@tauri-apps/*` npm package and Rust counterpart differ by major or minor:

```
Found version mismatched Tauri packages. Make sure the NPM package and Rust crate versions are on
the same major/minor releases:
tauri (v2.10.3) : @tauri-apps/api (v2.11.1)
```

The npm and Rust ecosystems can release different minors. A caret range can update npm past a compatible Rust minor and break `tauri build`.

### Decision

The app pins every `@tauri-apps/*` dependency and `@tauri-apps/cli` with a matching tilde range such as `~2.10.0`.
Patch updates remain available. A minor cannot update on one side alone.

### Consequences

- Update a Tauri minor on both sides: run `cargo update -p <crate>` in `src-tauri`, then update the matching `package.json` tilde range.
- Renovate can propose an npm minor beyond the tilde. Reject it until the Rust crate has the matching published minor.
- `src/lib/acknowledgments.ts` records both versions. `src/lib/__tests__/acknowledgments.test.ts` checks them against `node_modules` and `Cargo.lock`.
