# CLAUDE.md — devdrivr cockpit

Guidance for Claude Code working in `apps/cockpit`.

## Documentation

Full canonical docs live in [`documentation/`](./documentation/):

| Doc                                                                                                                  | When to read                                              |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`documentation/PRODUCT_MAP.md`](./documentation/PRODUCT_MAP.md)                                                     | **Check first** — product status, all 27 tools, shortcuts |
| [`documentation/ONBOARDING.md`](./documentation/ONBOARDING.md)                                                       | First-time setup (Rust, Bun, platform deps)               |
| [`documentation/TESTING.md`](./documentation/TESTING.md)                                                             | Test strategy, coverage map, how to add tests             |
| [`documentation/DESIGN_SYSTEM.md`](./documentation/DESIGN_SYSTEM.md)                                                 | Colour tokens, typography, components, layout patterns    |
| [`documentation/infrastructure/DIRECTORY_MAP.md`](./documentation/infrastructure/DIRECTORY_MAP.md)                   | Finding any file fast                                     |
| [`documentation/infrastructure/CODING_PATTERNS.md`](./documentation/infrastructure/CODING_PATTERNS.md)               | Before writing any code                                   |
| [`documentation/infrastructure/ARCHITECTURE_DECISIONS.md`](./documentation/infrastructure/ARCHITECTURE_DECISIONS.md) | Why things are the way they are (ADRs)                    |
| [`documentation/infrastructure/TROUBLESHOOTING.md`](./documentation/infrastructure/TROUBLESHOOTING.md)               | When something breaks                                     |

## Essentials

- **Package manager:** Bun only. Never use npm or yarn.
- **Run commands from:** `apps/cockpit/` unless noted.
- **Type-check:** `npx tsc --noEmit` — must stay clean.
- **Tests:** `bunx vitest run` (Vitest, 326 tests / 48 files). Use `bunx`, not `bun run test`.
- **Dev server:** `bun run tauri dev` (starts Vite + Rust binary).

## Architecture

### Bootstrap flow (`src/app/providers.tsx`)

1. Restore window geometry from SQLite (before any store loads)
2. Initialize all stores sequentially: settings → notes → snippets → history
3. Restore last active tool
4. Register window move/resize listeners to persist bounds

All store `init()` methods are idempotent (module-level promise guard). The `getDb()` function is a promise singleton — never call `Database.load()` directly.

### State management

Zustand 5 stores in `src/stores/`. Access pattern: `useStore((s) => s.field)` — always selector functions, never spread the whole store. Stores call `getDb()` for persistence.

### Tool system

- `src/app/tool-registry.ts` — single source of truth. Add tools here with `React.lazy()`.
- `src/app/tool-groups.tsx` — sidebar group metadata (Phosphor icons).
- `src/tools/<id>/` — tool component folder. One component per folder.
- Tools communicate with the shell via `dispatchToolAction` / `useToolActionListener` in `src/lib/tool-actions.ts`.

### SQLite

All DB access goes through `src/lib/db.ts`. Tables: `settings`, `tool_state`, `notes`, `snippets`, `history`, `api_environments`, `api_collections`, `api_requests`. WAL mode is set at connection time in `getDb()`, not in migrations (SQLite limitation).

### Theming

CSS custom properties defined in `src/index.css` under `:root` (dark) and `.light`. Always use `var(--color-*)` tokens — never hardcode colors. `applyTheme()` in `src/lib/theme.ts` writes a `localStorage` cache; the `index.html` inline script reads it synchronously to prevent flash.

### Tauri IPC

Capabilities live in `src-tauri/capabilities/default.json` scoped to `"windows": ["main"]`. If a new Tauri API is used, add the corresponding `core:*:allow-*` permission there.

## Code Style

- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`
- TypeScript strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — array access returns `T | undefined`
- No `any`. No class components. Functional components only.
- `useRef` for values that shouldn't trigger re-renders.
- Phosphor icons (`@phosphor-icons/react`) for all iconography — tree-shakeable, 6 weights.

## Key Files

| File                                  | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `src/app/providers.tsx`               | App bootstrap, window management                                 |
| `src/app/tool-registry.ts`            | Register tools here                                              |
| `src/lib/db.ts`                       | All SQLite queries                                               |
| `src/lib/theme.ts`                    | Theme application                                                |
| `src/stores/settings.store.ts`        | Theme, sidebar, editor preferences                               |
| `src/hooks/useGlobalShortcuts.ts`     | All keyboard shortcuts                                           |
| `src-tauri/capabilities/default.json` | IPC permissions                                                  |
| `src-tauri/migrations/`               | DB schema — 005 migrations (see SQLite Migrations section above) |
| `src-tauri/src/lib.rs`                | **Must also register** every migration file here                 |

## SQLite Migrations — Two-Step Rule

Adding a migration requires **two changes** — both must be in the same commit:

1. Create the SQL file: `src-tauri/migrations/00N_description.sql`
2. Register it in `src-tauri/src/lib.rs` — add a `Migration { version: N, ... }` entry to the `migrations` vec.

The SQL file alone does nothing. `tauri-plugin-sql` only runs migrations that are registered in `lib.rs`. Shipping without step 2 will leave existing installs with missing columns and runtime errors.

```rust
Migration {
    version: 5,
    description: "add snippets folder column",
    sql: include_str!("../migrations/005_snippets_folder.sql"),
    kind: MigrationKind::Up,
},
```

## What NOT to Do

- Don't call `Database.load()` directly — use `getDb()` from `src/lib/db.ts`
- Don't add new Tauri windows — the floating window pattern was removed due to IPC capability issues and listener leaks
- Don't use `applyTheme('system')` at module level — it causes a flash before the DB theme is loaded
- Don't use physical pixel APIs (`outerPosition`, `outerSize`) without converting via `scaleFactor()` + `toLogical()`
- Don't add `React.StrictMode` — it was removed to prevent double-mount flash in the Tauri WebView
- Don't skip the idempotent promise guard when writing a new store `init()` method

## Running the Test Suite

```bash
bunx vitest run       # run once (bun run test fails — shell can't resolve vitest binary)
bunx vitest           # watch mode
```

Tests live in `src/**/*.test.ts` and cover: platform detection, theming, keybinding logic.
