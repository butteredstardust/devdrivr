# TROUBLESHOOTING — devdrivr cockpit

> Self-healing guide. Start here when something breaks.

---

## Quick Diagnostics

```bash
# 1. Type errors?
npx tsc --noEmit

# 2. Tests failing?
bun run test

# 3. App won't start?
bun run tauri dev          # watch the terminal output

# 4. Something looks broken in the DB?
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db
.tables
SELECT * FROM settings;
.quit
```

---

## App Won't Start

### Blank white screen / "Loading..." forever

**Cause:** Store init failed, likely a DB schema mismatch after a migration change.

**Fix:**
```bash
# Option A: Reset the DB (loses all data)
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
bun run tauri dev

# Option B: Check what's in the DB
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db
.schema
```

### "Failed to initialize: ..." error shown in app

**Cause:** One of the store `init()` calls threw. Common causes:
- DB file corrupted (WAL journal out of sync)
- SQL syntax error in a query after code change

**Fix:**
```bash
# Force WAL checkpoint and try again
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db "PRAGMA wal_checkpoint(FULL);"
# If still broken, delete the DB (loses data)
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
```

### Rust compile error on `bun run tauri dev`

**Cause:** Tauri Rust code changed, or `src-tauri/target` is stale.

**Fix:**
```bash
cd apps/cockpit
bun run clean   # removes node_modules, dist, src-tauri/target
bun install
bun run tauri dev
```

---

## Window Opens Too Wide / Wrong Position

**Cause:** Window geometry was saved to SQLite when it was in a bad state (e.g., during a layout bug, or after disconnecting a monitor).

**Fix:**
```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "UPDATE settings SET value = '{\"x\":100,\"y\":100,\"width\":1200,\"height\":800}' WHERE key = 'windowBounds';"
```

Then restart the app. The bounds validator requires `width >= 800`, `height >= 500`, and position within `x > -200, y > -200`.

---

## Worker Tools Not Working

**Symptoms:** Code Formatter / Diff Viewer / TypeScript Playground / XML Tools silently fail or throw method-not-found errors.

**Root Cause History:** Comlink's `Proxy`-based `wrap()` returns `undefined` for property access in Tauri's WKWebView. This was replaced with a custom `postMessage`/`onmessage` RPC.

### "worker.method is not a function" / method is undefined

**Cause A:** Method name missing from the `useWorker` call.

**Fix:** Add the missing method to the methods array:
```typescript
const worker = useWorker<MyWorker>(
  () => new MyWorkerFactory(),
  ['method1', 'method2', 'missingMethod']   // ← add it here
)
```

**Cause B:** Worker file throws during import (bad dependency).

**How to check:** Open browser DevTools in Tauri (`Cmd+Option+I` in dev mode) → Console tab → look for Worker errors.

**Fix:** The worker dependency imports something CJS/UMD that crashes ESM workers. Replace with an ESM-native alternative:
```typescript
// ❌ node-sql-parser (CJS/UMD — crashes)
import nodeSqlParser from 'node-sql-parser'

// ✅ sql-formatter (ESM-native)
import { format } from 'sql-formatter'
```

### Worker spawns but never responds (Promise hangs forever)

**Cause:** `handleRpc(api)` was not called in the worker, or the method name doesn't match.

**Check:** Worker file must end with:
```typescript
handleRpc(api)   // not expose(api) — Comlink is removed
```

---

## Tool State Not Restoring

**Symptom:** Tool resets to default state every time you switch to it.

**Cause A:** `toolId` in `useToolState` doesn't match the registered `id` in `tool-registry.ts`.

**Fix:** Ensure they match exactly:
```typescript
// In the tool component:
const [state, updateState] = useToolState<State>('json-tools', defaultState)
//                                                 ^^^^^^^^^^

// In tool-registry.ts:
{ id: 'json-tools', ... }
//     ^^^^^^^^^^
```

**Cause B:** SQLite write failed silently (check console for `[useToolState]` errors).

**Check:** Open DevTools → Console → filter for "toolState".

---

## Theme / Colors Look Wrong

### Flash of wrong theme on startup

**Cause:** `applyTheme()` was called at module level (before the DB-loaded theme is ready).

**Rule:** Only call `applyTheme()` inside `async init()` functions.

**Check:** Search for module-level `applyTheme(` calls:
```bash
grep -rn "^applyTheme(" src/
```

### CSS variable not applied

**Cause:** A color was hardcoded instead of using a CSS variable.

**Fix:** Replace with a CSS token:
```typescript
// ❌
className="bg-zinc-900"
style={{ color: '#39ff14' }}

// ✅
className="bg-[var(--color-bg)]"
style={{ color: 'var(--color-accent)' }}
```

Available tokens: see `src/index.css` → `:root` block.

---

## Monaco Editor Issues

### Editor doesn't match app theme

**Cause:** `useMonacoTheme()` not called in the tool component.

**Fix:**
```typescript
export default function MyTool() {
  useMonacoTheme()   // ← must be called inside the component
  ...
}
```

### Editor options look different from other tools

**Fix:** Use the shared options constant:
```typescript
import { EDITOR_OPTIONS } from '@/hooks/useMonaco'

<Editor options={EDITOR_OPTIONS} ... />
```

---

## SQLite / DB Issues

### WAL files accumulating / DB locked

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Reset a specific setting

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "DELETE FROM settings WHERE key = 'windowBounds';"
```

### Inspect tool state

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "SELECT tool_id, substr(state, 1, 200) FROM tool_state;"
```

### Reset everything (nuclear option)

```bash
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
# Restart the app — DB is recreated from migrations automatically
```

---

## TypeScript Errors

### `Object is possibly undefined` on array access

This is `noUncheckedIndexedAccess` — array access always returns `T | undefined`.

```typescript
const items = getItems()
// ❌
const first = items[0].name   // Error: Object is possibly 'undefined'
// ✅
const first = items[0]?.name ?? 'default'
```

### `exactOptionalPropertyTypes` errors

```typescript
type Config = { label?: string }
// ❌ — exactOptionalPropertyTypes treats this as a type violation in some contexts
const c: Config = { label: undefined }

// ✅
const c: Config = {}
// or explicitly cast when needed
const c = { label: undefined } as Config
```

### `noUnusedLocals` / `noUnusedParameters`

Remove unused variables/parameters, or prefix with `_` to intentionally ignore:
```typescript
function handler(_event: MouseEvent, value: string) {
  console.log(value)  // _event is intentionally unused
}
```

---

## Keyboard Shortcuts Not Firing

**Cause A:** Focus is in an editable element (input, textarea, Monaco).

**Behavior:** Shortcuts without modifier keys are suppressed in editable fields. This is intentional.

**Fix:** Add the `mod: true` flag to the shortcut combo — modifier shortcuts work everywhere:
```typescript
useKeyboardShortcut({ key: 'Enter', mod: true }, handleSubmit)   // works in inputs too
```

**Cause B:** Two components registering the same shortcut — first one wins.

**Fix:** Move the shortcut to `useGlobalShortcuts.ts` and dispatch via `dispatchToolAction`.

---

## Build / CI Issues

### `bun run build` fails — TypeScript errors

```bash
npx tsc --noEmit   # find all errors first
```

### Worker chunk not found in production build

**Cause:** Worker was imported with `new URL()` instead of `?worker`.

**Fix:**
```typescript
// ❌
new Worker(new URL('./my.worker.ts', import.meta.url), { type: 'module' })

// ✅
import MyWorkerFactory from './my.worker.ts?worker'
new MyWorkerFactory()
```

### Pre-commit hook failing

The hook is **advisory-only** (warns, never blocks). If it exits non-zero due to a shell script bug, use:
```bash
git commit --no-verify -m "your message"
```

The checks it runs are: `Database.load()` outside db.ts, `StrictMode`, `new WebviewWindow`, `applyTheme` at module level, missing `scaleFactor()`, TypeScript `any`, hardcoded colors, npm/yarn usage, missing init promise guard, `console.log`.

---

## Tauri / IPC Errors

### "Not allowed" / permission denied in console

**Cause:** A new Tauri API is being used but the capability isn't declared.

**Fix:** Add the permission to `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "core:window:allow-your-new-api"
  ]
}
```

Find the correct permission name in [Tauri 2 docs](https://tauri.app/reference/acl/capability/).

### IPC call never resolves

**Cause:** Tauri command panicked on the Rust side.

**Check:** Run `bun run tauri dev` and watch for `[ERROR]` lines in the terminal output (not the browser console).

---

## Performance

### App feels slow when switching tools

**Check:** Is `useToolState` loading from SQLite (cache miss) or memory (cache hit)?

Add a temporary `console.log` to `useToolState.ts` to see which path is taken on switch. If it's always loading from SQLite, the in-memory cache isn't being populated — check that `toolId` matches exactly.

### Large history causing slow startup

Default retention is 500 entries per tool. Reduce it in Settings → History Retention.

Or purge directly:
```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "DELETE FROM history WHERE timestamp < (strftime('%s', 'now', '-7 days') * 1000);"
```
