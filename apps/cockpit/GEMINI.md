# GEMINI.md — devdrivr cockpit

Guidance for Gemini CLI working in `apps/cockpit`.

## Project Context

devdrivr cockpit is a Tauri 2 + React 19 + TypeScript desktop app. 28 developer tools. SQLite for persistence. Bun as package manager.

## Tool Equivalents (Gemini CLI → Claude Code)

| Task | Command |
|------|---------|
| Read a file | `cat <path>` or read tool |
| Search files | `find` / `grep` |
| Edit a file | Edit the file directly |
| Run shell | Shell tool |

## Essential Commands

```bash
# From apps/cockpit/
bun run tauri dev       # dev server
npx tsc --noEmit        # type-check
bun run test            # run tests
```

## Critical Patterns

**DB access** — always use the singleton:
```ts
import { getDb, getSetting, setSetting } from '@/lib/db'
// Never: Database.load('sqlite:cockpit.db')
```

**Store init** — idempotent guard required:
```ts
let initPromise: Promise<void> | null = null
init: async () => {
  if (!initPromise) {
    initPromise = (async () => { /* load data, set state */ })()
  }
  return initPromise
}
```

**Colors** — tokens only:
```ts
// Good:  className="text-[var(--color-text)]"
// Bad:   className="text-gray-300"
```

**Tauri IPC** — new APIs need capability entries in `src-tauri/capabilities/default.json`:
```json
"core:window:allow-<method-name>"
```

## What to Avoid

- `React.StrictMode` — removed intentionally (causes double-mount flash in Tauri WebView)
- Multiple Tauri windows — removed due to IPC capability issues
- Physical pixel APIs without logical conversion on Retina displays
- `npm` or `yarn` — Bun only
