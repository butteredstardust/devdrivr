# AGENTS.md — devdrivr cockpit

Instructions for AI agents (Codex, Copilot, etc.) working in `apps/cockpit`.

## Project

devdrivr cockpit is a Tauri 2 desktop app — a local-first developer utility workspace with 28 tools. Built with React 19, TypeScript 5.9, Tailwind CSS 4, Zustand 5, and SQLite.

## Commands

```bash
# Always run from apps/cockpit/
bun install                  # install dependencies
bun run tauri dev            # start dev server
npx tsc --noEmit             # type-check (must pass)
bun run test                 # run tests (34 tests, must all pass)
bun run tauri build          # production build
```

## Key Conventions

1. **Package manager:** Bun only. Never npm/yarn.
2. **DB access:** Always use `getDb()` from `src/lib/db.ts` — it's a promise singleton. Never call `Database.load()` directly.
3. **Colors:** Always use CSS custom property tokens (`var(--color-*)`) from `src/index.css`. Never hardcode colors.
4. **Icons:** Use `@phosphor-icons/react` for all icons.
5. **Store inits:** Any new store `init()` must use a module-level promise guard (see existing stores for the pattern).
6. **TypeScript:** Strict mode is on — `noUncheckedIndexedAccess` means array indexing returns `T | undefined`. Handle it.

## File Map

```
src/app/tool-registry.ts    ← add new tools here
src/app/providers.tsx       ← app bootstrap (touch carefully)
src/lib/db.ts               ← all DB queries
src/stores/                 ← Zustand stores
src/tools/<id>/             ← tool components
src-tauri/capabilities/     ← IPC permissions (add new permissions here)
```

## Before Submitting

- `npx tsc --noEmit` passes with zero errors
- `bun run test` passes (34/34)
- No hardcoded colors, no direct `Database.load()` calls, no `any` types
