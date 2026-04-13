# AGENTS.md — devdrivr monorepo

Instructions for AI coding agents (OpenAI Codex, GitHub Copilot Workspace, Jules, etc.)
working in this repository.

---

## Active Development

All active work is in **`apps/cockpit`** — a Tauri 2 + React 19 desktop app.

> **Read this first**: [`apps/cockpit/AGENTS.md`](apps/cockpit/AGENTS.md)
> contains the full coding rules, file map, non-negotiables, and submission checklist
> for cockpit. Start there before touching anything in that directory.

---

## Monorepo Basics

- **Package manager**: Bun only. Never use npm or yarn.
- **Build system**: Turborepo (`turbo.json` at root).
- **Run commands from the repo root** unless the task is cockpit-specific
  (cockpit commands must run from `apps/cockpit/`).

```bash
bun install          # install all workspace dependencies
bun run dev          # start all dev servers in parallel
bun run check-types  # tsc --noEmit across all packages
bun run build:web    # Next.js production build
bun run fix          # manypkg fix (dependency version alignment)
bun run clean        # remove node_modules & lockfile
```

## Apps

| Path | Stack | Status |
|---|---|---|
| `apps/cockpit` | Tauri 2 + React 19 + Vite | ✅ Active — see `apps/cockpit/AGENTS.md` |
| `apps/next` | Next.js 13.5 (Pages Router) | Maintained |
| `apps/expo` | Expo 49 / React Native 0.72 | Maintained |
| `apps/tauri` | Tauri 1.4 (wraps Next.js) | Maintained |
| `packages/api` | Hono + Cloudflare Workers + Drizzle | Maintained |
| `packages/ui` | Tamagui shared components | Maintained |

## Code Style (all packages)

Prettier config (`.prettierrc`):
- `semi: false`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`
