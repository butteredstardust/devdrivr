# TROUBLESHOOTING — devdrivr

> Use this guide when the app does not work as expected. Read the symptom, cause, and fix in order.

---

## Quick Diagnostics

Run these checks to identify the failing area.

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

**Cause:** Store initialization fails. A database schema mismatch can cause this.

**Fix:** WARNING: Resetting the database removes all app data.

```bash
# Option A: Reset the DB (loses all data)
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
bun run tauri dev

# Option B: Check what's in the DB
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db
.schema
```

### "Failed to initialize: ..." error shown in app

**Cause:** A store `init()` call throws. Common causes include:

- DB file corrupted (WAL journal out of sync)
- SQL syntax error in a query after code change

**Fix:** WARNING: Removing the database removes all app data.

```bash
# Force WAL checkpoint and try again
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db "PRAGMA wal_checkpoint(FULL);"
# If still broken, delete the DB (loses data)
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
```

### Rust compile error on `bun run tauri dev`

**Cause:** Rust code changes or a stale `src-tauri/target` directory prevent compilation.

**Fix:**

```bash
cd .
bun run clean   # removes node_modules, dist, src-tauri/target
bun install
bun run tauri dev
```

---

## Window Opens Too Wide / Wrong Position

**Cause:** SQLite stores invalid window geometry.

**Fix:**

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "UPDATE settings SET value = '{\"x\":100,\"y\":100,\"width\":1200,\"height\":800}' WHERE key = 'windowBounds';"
```

Restart the app. The validator requires `width >= 800` and `height >= 500`.
It requires `x > -200` and `y > -200`.

---

## Worker Tools Not Working

**Symptoms:** Code Formatter, Diff Viewer, TypeScript Playground, or XML Tools fail silently. They can also report missing methods.

**Cause:** Comlink `Proxy` property access returns `undefined` in Tauri's WKWebView. Workers use custom `postMessage` and `onmessage` RPC.

### "worker.method is not a function" / method is undefined

**Cause A:** The `useWorker` call omits the method name.

**Fix:** Add the missing method to the methods array:

```typescript
const worker = useWorker<MyWorker>(
  () => new MyWorkerFactory(),
  ['method1', 'method2', 'missingMethod'] // ← add it here
)
```

**Cause B:** A dependency causes the worker file to throw during import.

**Check:** Open Tauri DevTools with `Cmd+Option+I` in dev mode. Check the Console tab for worker errors.

**Fix:** Replace the CJS or UMD dependency with an ESM-native alternative.

```typescript
// ❌ node-sql-parser (CJS/UMD — crashes)
import nodeSqlParser from 'node-sql-parser'

// ✅ sql-formatter (ESM-native)
import { format } from 'sql-formatter'
```

### Worker spawns but never responds (Promise hangs forever)

**Cause:** The worker does not call `handleRpc(api)`. The method name can also differ.

**Check:** End the worker file with:

```typescript
handleRpc(api) // not expose(api) — Comlink is removed
```

---

## Tool State Not Restoring

**Symptom:** Tool resets to default state every time you switch to it.

**Cause A:** The `toolId` in `useToolState` differs from the registered `id` in `tool-registry.ts`.

**Fix:** Ensure they match exactly:

```typescript
// In the tool component:
const [state, updateState] = useToolState<State>('json-tools', defaultState)
//                                                 ^^^^^^^^^^

// In tool-registry.ts:
{ id: 'json-tools', ... }
//     ^^^^^^^^^^
```

**Cause B:** The SQLite write fails silently.

**Check:** Open DevTools. Filter the Console for `toolState`.

---

## Theme / Colors Look Wrong

### Flash of wrong theme on startup

**Cause:** Module-level `applyTheme()` runs before the database theme is ready.

**Fix:** Call `applyTheme()` only inside `async init()` functions.

**Check:** Search for module-level `applyTheme(` calls.

```bash
grep -rn "^applyTheme(" src/
```

### CSS variable not applied

**Cause:** A hardcoded color bypasses the CSS variables.

**Fix:** Replace with a CSS token:

```typescript
// ❌
className="bg-zinc-900"
style={{ color: '#39ff14' }}

// ✅
className="bg-[var(--color-bg)]"
style={{ color: 'var(--color-accent)' }}
```

Check available tokens in the `:root` block of `src/index.css`.

---

## Monaco Editor Issues

### Editor doesn't match app theme

**Cause:** The tool component does not call `useMonacoTheme()`.

**Fix:**

```typescript
export default function MyTool() {
  useMonacoTheme()   // ← must be called inside the component
  ...
}
```

### Editor options look different from other tools

**Cause:** The tool does not use the shared editor options.

**Fix:** Use the shared options constant.

```typescript
import { EDITOR_OPTIONS } from '@/hooks/useMonaco'

<Editor options={EDITOR_OPTIONS} ... />
```

---

## SQLite / DB Issues

### WAL files accumulating / DB locked

**Cause:** WAL files need a checkpoint, or another process holds the database lock.

**Fix:** Run this checkpoint command.

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Reset a specific setting

**Symptom:** One persisted setting is invalid.

**Fix:** Remove the setting row.

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "DELETE FROM settings WHERE key = 'windowBounds';"
```

### Inspect tool state

**Symptom:** A tool does not restore persisted state.

**Fix:** Inspect the stored state.

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "SELECT tool_id, substr(state, 1, 200) FROM tool_state;"
```

### Reset everything (nuclear option)

**Symptom:** The database remains unusable.

**Cause:** The database cannot recover with a checkpoint.

**Fix:** WARNING: This removes all app data.

```bash
rm ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db*
# Restart the app — DB is recreated from migrations automatically
```

---

## TypeScript Errors

### `Object is possibly undefined` on array access

**Cause:** `noUncheckedIndexedAccess` makes array access return `T | undefined`.

**Fix:** Check the value before you use it.

```typescript
const items = getItems()
// ❌
const first = items[0].name // Error: Object is possibly 'undefined'
// ✅
const first = items[0]?.name ?? 'default'
```

### `exactOptionalPropertyTypes` errors

**Cause:** Optional properties require an absent key in some contexts.

**Fix:** Omit the key or use the stated cast.

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

**Cause:** A local variable or parameter is unused.

**Fix:** Remove it. Prefix it with `_` only when you intentionally ignore it.

```typescript
function handler(_event: MouseEvent, value: string) {
  console.log(value) // _event is intentionally unused
}
```

---

## Keyboard Shortcuts Not Firing

**Cause A:** Focus is in an editable element such as an input, textarea, or Monaco.

**Behavior:** Editable fields suppress shortcuts without modifier keys.

**Fix:** Add `mod: true` to the shortcut combination.

```typescript
useKeyboardShortcut({ key: 'Enter', mod: true }, handleSubmit) // works in inputs too
```

**Cause B:** Two components register the same shortcut. The first registration wins.

**Fix:** Move the shortcut to `useGlobalShortcuts.ts` and dispatch via `dispatchToolAction`.

---

## Build / CI Issues

### `bun run build` fails — TypeScript errors

**Cause:** TypeScript validation fails.

**Fix:** Run the type check first.

```bash
npx tsc --noEmit   # find all errors first
```

### Worker chunk not found in production build

**Cause:** The worker import uses `new URL()` instead of `?worker`.

**Fix:**

```typescript
// ❌
new Worker(new URL('./my.worker.ts', import.meta.url), { type: 'module' })

// ✅
import MyWorkerFactory from './my.worker.ts?worker'
new MyWorkerFactory()
```

### `cargo` / `bunx tauri build` — "command not found: cargo" or "failed to run `cargo metadata`"

**Cause:** Homebrew `rustup` provides Cargo shims in `/opt/homebrew/opt/rustup/bin`.
The shim directory is not on `PATH`.

**Fix:** Add the shim directory to `PATH`. Do not prefix individual commands.

```bash
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
```

`bunx tauri build` runs `cargo metadata` first. A missing `cargo` can show as a config error.

### `cargo clippy` fails reading permissions from a path that no longer exists

```
failed to read plugin permissions: failed to read file
'.../apps/cockpit/src-tauri/target/debug/build/.../app_hide.toml': No such file or directory
```

**Cause:** The build cache stores absolute paths. `src-tauri/target/` can retain a path that no longer exists.

**Fix:**

```bash
rm -rf src-tauri/target   # or: cargo clean --manifest-path src-tauri/Cargo.toml
```

CI uses a cold cache with current paths.

### Pre-commit hook failing

**Cause:** A pre-commit check exits non-zero.

**Fix:** Correct the reported violation. If a shell-script error is unrelated to your code, use this bypass.

```bash
git commit --no-verify -m "your message"
```

The hook checks `Database.load()` outside db.ts, `StrictMode`, `new WebviewWindow`, module-level `applyTheme`, missing `scaleFactor()`, TypeScript `any`, hardcoded colors, npm/yarn usage, missing init guards, and `console.log`.

---

## Tauri / IPC Errors

### "Not allowed" / permission denied in console

**Cause:** The new Tauri API has no declared capability.

**Fix:** Add the permission to `src-tauri/capabilities/default.json`:

```json
{
  "permissions": ["core:window:allow-your-new-api"]
}
```

Check the permission name in [Tauri 2 docs](https://tauri.app/reference/acl/capability/).

### IPC call never resolves

**Cause:** The Tauri command panics on the Rust side.

**Check:** Run `bun run tauri dev`. Check terminal output for `[ERROR]` lines.

---

## Performance

### App feels slow when switching tools

**Cause:** `useToolState` loads from SQLite instead of memory.

**Check:** Check whether the state is a cache miss or cache hit.

Add temporary `console.log` output to `useToolState.ts`. Check the path during a tool switch.
If it always loads SQLite, check that `toolId` matches exactly.

### Large history causing slow startup

**Cause:** History retention stores 500 entries per tool.

**Fix:** Reduce History Retention in Settings.

**Fix:** Or remove old entries directly.

```bash
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db \
  "DELETE FROM history WHERE timestamp < (strftime('%s', 'now', '-7 days') * 1000);"
```
