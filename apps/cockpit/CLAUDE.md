# CLAUDE.md — devdrivr cockpit

Guidance for Claude Code working in `apps/cockpit`.

## Git Workflow

### Never commit directly to main

All work goes on a feature branch. If commits accidentally land on `main` before a branch is created, rescue them:

```bash
git checkout -b feat/my-feature   # create branch at current HEAD (captures the commits)
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

```
feat(cockpit): add cron expression parser
fix(cockpit): resolve tag filter losing focus on blur
docs(cockpit): update CLAUDE.md with Fuse.js pattern
chore(release): bump version to 0.1.37 [skip ci]
```

Format: `type(scope): short description` — imperative mood, no period, under 72 chars. Scope is almost always `cockpit`.

### Commits need HUSKY_PATH

The pre-commit hook calls `bunx`. Bun lives in `/opt/homebrew/bin`, which isn't on the minimal shell PATH. Always prefix:

```bash
HUSKY_PATH=/opt/homebrew/bin PATH="/opt/homebrew/bin:$PATH" git commit -m "..."
```

### PRs

- Title: matches the commit message format, under 70 chars
- Body: **Summary** bullets (user-facing language) + **Test plan** checklist
- Target branch: always `main`
- Never force-push to `main`

When asked to "open a PR" or "commit and push", the full sequence is implied: branch (if not already on one) → commit → `git push -u origin <branch>` → `gh pr create`.

---

## Development Workflow

When given a feature or update request, follow this pipeline end-to-end without pausing for permission at each step:

1. **Evaluate & refine** — read the relevant code, surface any tradeoffs or ambiguities, propose adjustments if the request has edge cases worth flagging
2. **Plan** — agree on approach before touching code; for anything non-trivial, write out the steps
3. **Implement** — write the code; don't add features, abstractions, or cleanup beyond what was asked
4. **Verify** — `npx tsc --noEmit` (zero errors) + `bunx vitest run` (all passing); fix anything broken before moving on
5. **Code review** — self-review or spawn a reviewer agent; catch bugs, anti-patterns, and anything that violates the rules in this file
6. **Fix** — address every issue found in review before committing
7. **Commit & push** — conventional commit message on a feature branch
8. **Open PR** — description targeted at a human reviewer, not a dev log

Operate autonomously through all 8 steps. Make decisions informed by best practice and the patterns in this file. Only pause to ask if something is genuinely ambiguous about the intent of the request — not for routine implementation choices.

---

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
- **Run commands from:** `apps/cockpit/` — never the monorepo root.
- **PATH prefix required:** Bun and other Homebrew tools are in `/opt/homebrew/bin`, which is not on the default shell PATH. Every command below needs the prefix.

## Commands

All commands must be run from `apps/cockpit/` with the PATH prefix. Running from the monorepo root will silently use the wrong config or fail to find binaries.

```bash
# Typecheck — must be zero errors before committing
PATH="/opt/homebrew/bin:$PATH" npx tsc --noEmit

# Tests — use bunx, NOT bun run test (bun can't resolve the vitest binary directly)
PATH="/opt/homebrew/bin:$PATH" bunx vitest run        # run once
PATH="/opt/homebrew/bin:$PATH" bunx vitest            # watch mode

# Lint — ESLint across src/
PATH="/opt/homebrew/bin:$PATH" bun run lint

# Dev server — starts Vite + Tauri hot-reload
PATH="/opt/homebrew/bin:$PATH" bun run tauri dev

# Production build
PATH="/opt/homebrew/bin:$PATH" bun run tauri build

# Install / restore dependencies
PATH="/opt/homebrew/bin:$PATH" bun install

# Clean build artifacts and node_modules
PATH="/opt/homebrew/bin:$PATH" bun run clean
```

### Common mistakes

| Wrong                      | Right                                | Why                                                             |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Run from monorepo root     | Run from `apps/cockpit/`             | Wrong tsconfig, wrong vitest config, wrong node_modules         |
| `bun run test`             | `bunx vitest run`                    | bun resolves scripts but can't find the `vitest` binary in PATH |
| `npm run ...` / `yarn ...` | `bun run ...`                        | npm/yarn are not the package manager here                       |
| No PATH prefix             | `PATH="/opt/homebrew/bin:$PATH" ...` | Homebrew tools not on default shell PATH                        |

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

### Path alias

`@/` maps to `src/`. Use it for all imports — never use relative paths like `../../lib/db`:

```typescript
// ✅
import { getDb } from '@/lib/db'
import { useSnippetsStore } from '@/stores/snippets.store'

// ❌ Works but breaks the codebase pattern
import { getDb } from '../../lib/db'
```

### Tailwind v4 — no config file

This project uses Tailwind CSS 4, which is CSS-first. There is no `tailwind.config.js` — configuration lives in `src/index.css`. Do not create a config file. Do not use `@apply` with v3 plugin syntax. Arbitrary values use the standard bracket syntax: `bg-[var(--color-surface)]`, `grid-rows-[0fr]`.

### Prefer platform APIs over npm packages

Reach for browser/web platform APIs before adding a dependency. This codebase already uses:

- **Canvas 2D** for image resize, crop, compress, export — no `sharp` or `jimp`
- **Web Crypto** (`crypto.subtle`) for hashing — no `crypto-js`
- **`TextEncoder`/`TextDecoder`** for UTF-8 — no `buffer` polyfill
- **`DOMParser`** for HTML/XML parsing — no `cheerio`

If a browser API exists that handles the task, use it.

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

### Migration backfill rule

When adding a column via `ALTER TABLE`, existing rows get `NULL` for that column. Always include an explicit `UPDATE` in the same migration to backfill a sensible default — otherwise existing installs silently have corrupt/missing data:

```sql
ALTER TABLE snippets ADD COLUMN folder TEXT NOT NULL DEFAULT '';
UPDATE snippets SET folder = '' WHERE folder IS NULL;
```

Never rely on `DEFAULT` alone for existing rows — always backfill explicitly.

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
- Don't use the Preview MCP tool — this is a desktop app running in Tauri; the browser preview cannot render it and wastes tokens
- Don't use deprecated `unescape`/`escape` for UTF-8 — use `TextEncoder`/`TextDecoder` instead

## Patterns Established in This Codebase

### React 19 — Non-Passive Wheel Events

React 19 registers `wheel` and `touch` listeners as passive by default, so calling
`e.preventDefault()` in a React `onWheel` handler has no effect (browser ignores it).
For zoom-to-cursor and any scroll-hijacking, attach the listener imperatively:

```typescript
useEffect(
  () => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // zoom logic
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  },
  [
    /* stable deps only */
  ]
)
```

### Callback Ref Pattern (Conditional Branches)

A single `useRef` + `useEffect` wheel-listener fails when the ref target is inside a
conditional JSX branch — the effect runs once on mount when the element doesn't exist yet.
Use a `useCallback` callback ref instead so the listener attaches/detaches as the node
mounts and unmounts:

```typescript
const wheelCleanupRef = useRef<(() => void) | null>(null)

const callbackRef = useCallback(
  (el: HTMLDivElement | null) => {
    if (wheelCleanupRef.current) {
      wheelCleanupRef.current()
      wheelCleanupRef.current = null
    }
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault() /* ... */
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel)
  },
  [
    /* stable deps */
  ]
)

// Use as: <div ref={callbackRef}>
```

### transformRef Mirror Pattern (Zoom State)

For zoom/pan state that is read inside a non-React event handler (wheel) and also
needs to trigger re-renders for a zoom badge, keep a `useRef` and `useState` in sync
via a single setter. The `useRef` prevents stale closures; the `useState` drives renders:

```typescript
const [transform, _setTransform] = useState<Transform>(DEFAULT)
const transformRef = useRef<Transform>(DEFAULT)
const setTransform = useCallback((t: Transform) => {
  transformRef.current = t // read by wheel handler — always fresh
  _setTransform(t) // triggers zoom badge re-render
}, [])
```

### Cross-Tool State Injection via `useToolStateCache`

To pre-populate a destination tool before navigating to it, write directly to
`useToolStateCache` (Zustand, accessible outside components). The target tool reads
from the cache synchronously on mount via `useToolState` — no pub/sub or IPC needed:

```typescript
const cacheSet = useToolStateCache((s) => s.set)
const cacheGet = useToolStateCache((s) => s.get)
const openTab = useUiStore((s) => s.openTab)

const handleSend = useCallback(() => {
  const existing = cacheGet('target-tool')
  cacheSet('target-tool', {
    ...existing,
    draft: {
      /* ... */
    },
  })
  openTab('target-tool')
}, [cacheGet, cacheSet, openTab])
```

### Canvas 2D for Image Processing

No npm image library is needed. The Canvas 2D API handles resize + crop + format
conversion + quality encoding entirely in the browser:

```typescript
canvas.width = outW
canvas.height = outH
ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
canvas.toBlob(
  (blob) => {
    /* download or clipboard */
  },
  'image/jpeg',
  quality / 100
)
```

For export, `canvas.toDataURL` is synchronous. For large images, debounce any
quality-slider or resize-input that triggers a re-render with a canvas redraw.

### Fuse.js Search Highlighting

Use `includeMatches: true` in Fuse config. Define a local interface to avoid importing Fuse types directly:

```typescript
interface FuseMatchEntry {
  key?: string
  indices: ReadonlyArray<[number, number]>
}
```

Keep two memos: `fuseResults` (drives both the filtered list AND match data) and `matchMap: Map<id, ReadonlyArray<FuseMatchEntry>>`. The `highlightMatches(text, matches, key)` helper wraps matched char ranges in `<mark>`.

**Use a composite React key** `key={\`${start}-${end}\`}`— Fuse can return overlapping ranges where two entries share the same`start`value, which causes duplicate key warnings with`key={start}` alone.

### CSS Grid Collapse Animation

```tsx
<div
  className={`grid transition-[grid-template-rows] duration-200 ${
    collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
  }`}
>
  <div className="overflow-hidden">{children}</div>
</div>
```

The outer div transitions between row sizes; the inner `overflow-hidden` div clips the content. No need to know the pixel height. Set `aria-expanded={!collapsed}` on the toggle button.

### ARIA Combobox for Autocomplete Inputs

```tsx
<input
  role="combobox"
  aria-autocomplete="list"
  aria-expanded={suggestions.length > 0}
  aria-controls="suggestions-listbox"
  aria-activedescendant={index >= 0 ? `suggestion-${suggestions[index]}` : undefined}
/>
<div role="listbox" id="suggestions-listbox" data-testid="suggestions">
  {suggestions.map((s, i) => (
    <button
      key={s}
      role="option"
      id={`suggestion-${s}`}
      onMouseDown={(e) => {
        e.preventDefault() // keep input focus
        void handleSelect(s) // void prefix — async handler in onMouseDown
      }}
    />
  ))}
</div>
```

`onMouseDown` + `e.preventDefault()` prevents the input from losing focus when clicking a suggestion. Always prefix async `onMouseDown` handlers with `void` to avoid unhandled promise rejections.

### ResizeObserver Guard for jsdom

`ResizeObserver` is undefined in jsdom (Vitest). Guard before using it:

```typescript
if (typeof ResizeObserver === 'undefined') return
const observer = new ResizeObserver(update)
observer.observe(el)
return () => observer.disconnect()
```

## Running the Test Suite

```bash
bunx vitest run       # run once (bun run test fails — shell can't resolve vitest binary)
bunx vitest           # watch mode
```

Tests live in `src/**/__tests__/*.test.tsx` for tool tests and `src/**/*.test.ts` for unit tests.

### Test file location

Tool tests go in `src/tools/__tests__/<tool-id>.test.tsx` — **not** co-located with the component. Putting a test file next to the component (`src/tools/my-tool/MyTool.test.tsx`) works but breaks the established pattern.

```
src/tools/__tests__/
  snippets.test.tsx
  markdown-editor.test.tsx
  api-client.test.tsx
  ...
```

### Testing Patterns — Common Traps

**Text split by `<mark>` elements** — `highlightMatches` renders `<mark>` nodes that split the text across multiple DOM nodes. `getByText(/regex/)` and `getByText('full text')` will fail because testing-library matches single text nodes. Query the parent element and check `.textContent` instead:

```typescript
const titleEl = document.querySelector('.my-title-class')
expect(titleEl?.textContent).toBe('fetchUserData')
```

**Ambiguous `getByText` when same text appears in multiple places** — e.g. a global tag chip and an autocomplete suggestion dropdown both showing "api" causes "Found multiple elements". Scope to the container via `data-testid` and use `toHaveTextContent()`:

```typescript
const suggestions = screen.getByTestId('tag-suggestions')
expect(suggestions).toHaveTextContent('api')
```
