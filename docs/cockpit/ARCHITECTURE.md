# cockpit Architecture

## Overview

cockpit is a single-window Tauri 2 desktop app. The Rust backend is thin — it registers plugins and defines the window. All application logic lives in the React/TypeScript frontend, which talks to the OS via Tauri IPC.

## Layers

```
┌─────────────────────────────────────────┐
│             React UI (WebKit)            │
│  ┌──────────┐  ┌───────────────────┐    │
│  │  Shell   │  │   Tool Components │    │
│  │ Sidebar  │  │  (lazy-loaded)    │    │
│  │ Workspace│  └───────────────────┘    │
│  │ Drawers  │                           │
│  └──────────┘                           │
│  ┌──────────────────────────────────┐   │
│  │   Zustand Stores                 │   │
│  │  settings · notes · snippets     │   │
│  │  history · ui                    │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │   lib/db.ts  (SQLite singleton)  │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│           Tauri IPC Bridge              │
│  tauri-plugin-sql · fs · http · dialog  │
├─────────────────────────────────────────┤
│           Rust (Tauri 2)                │
│  Window management · Plugin host        │
└─────────────────────────────────────────┘
```

## Startup Sequence

1. `index.html` inline script reads `localStorage['theme-cache']` and sets `html.className` synchronously — prevents flash before JS loads.
2. Vite loads `main.tsx` which mounts `<Providers><App/></Providers>`.
3. `Providers` bootstrap runs:
   - Restore window geometry from SQLite (before stores, to minimize visible resize)
   - Initialize stores: settings → notes → snippets → history
   - Restore last active tool
   - Register debounced move/resize listeners to persist window bounds
4. `App` renders once `initialized` becomes true.

## Tool System

Tools are registered in `src/app/tool-registry.ts` as lazy-loaded React components. The `Workspace` component renders the active tool inside a `Suspense` + `ErrorBoundary`.

### Inter-component Communication

Tools don't receive props. They communicate with the shell via a custom event bus (`src/lib/tool-actions.ts`):

```ts
// Shell dispatches:
dispatchToolAction({ type: 'open-file', content, filename })
dispatchToolAction({ type: 'execute' })
dispatchToolAction({ type: 'copy-output' })

// Tool listens:
useToolActionListener((action) => {
  if (action.type === 'execute') { ... }
})
```

## State Architecture

Five Zustand stores, each backed by SQLite:

| Store | Key State | Persists To |
|-------|-----------|-------------|
| `settings` | theme, sidebarCollapsed, editorPrefs | `settings` table (JSON blob) |
| `ui` | activeTool, toasts, modal open states | `settings` table (activeTool only) |
| `notes` | notes array | `notes` table |
| `snippets` | snippets array | `snippets` table |
| `history` | recent entries (last 200) | `history` table |

All `init()` methods use a module-level promise guard for idempotency:
```ts
let initPromise: Promise<void> | null = null
init: async () => {
  if (!initPromise) initPromise = (async () => { ... })()
  return initPromise
}
```

## SQLite

Single database: `cockpit.db` in the platform app data directory.

- **Connection:** `getDb()` in `src/lib/db.ts` — promise singleton, opens once.
- **WAL mode:** Set at connection time (`PRAGMA journal_mode=WAL`). Cannot be set inside a migration transaction.
- **Migrations:** Managed by `tauri-plugin-sql` from `src-tauri/migrations/`. Version 1 creates all tables.
- **Queries:** All in `src/lib/db.ts` — never inline SQL in components or stores.

## Theming

CSS custom properties in `src/index.css` under `:root` (dark default) and `.light`. Resolved by adding/removing the `light` class on `<html>`.

Flash prevention chain:
1. `index.html` reads `localStorage['theme-cache']` synchronously → sets class before paint
2. `applyTheme()` in `src/lib/theme.ts` updates the class and writes the cache
3. `settings.store.ts` calls `applyTheme()` after loading from DB

## Window Management

- Default size: 1200×800, min 800×500, centered
- Saved bounds restored at startup using **logical pixels** (`LogicalPosition`/`LogicalSize`). Physical pixel APIs (`outerPosition`, `outerSize`) require conversion via `scaleFactor()` before saving.
- Bounds are validated (800–4000 × 500–3000) before restoring to discard corrupted data.
- Bounds are persisted with a 2s debounce on move/resize events.

## IPC Capabilities

`src-tauri/capabilities/default.json` grants permissions scoped to the `"main"` window. Current grants: `core:default`, window management APIs, `sql`, `fs`, `http`, `dialog`.

When adding a new Tauri API, add the corresponding `core:*:allow-*` entry to this file.
