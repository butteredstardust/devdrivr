# AGENTS.md — devdrivr monorepo

Instructions for AI coding agents (OpenAI Codex, GitHub Copilot Workspace, Jules, etc.)
working in this repository.

---

## Active Development

All active work is in **`apps/cockpit`** — a Tauri 2 + React 19 desktop app. It is the only part
of this repo under continuous development (hundreds of commits over the past several months, vs.
a handful of dependency-bump commits everywhere else — see the table below).

> **Read this first**: [`apps/cockpit/AGENTS.md`](apps/cockpit/AGENTS.md)
> contains the full coding rules, file map, non-negotiables, and submission checklist
> for cockpit. Start there before touching anything in that directory. This file is a
> navigational hub for the monorepo as a whole — it does not restate cockpit's rules.

---

## Monorepo Basics

- **Package manager**: Bun only (`bun.lock` is the lockfile). Never use npm or yarn.
- **Build system**: Turborepo (`turbo.json` at root).
- **Run commands from the repo root** unless the task is app-specific, in which case most
  per-app scripts also work via `cd apps/<app> && bun run <script>`. Cockpit in particular
  must be run from `apps/cockpit/` — see its own AGENTS.md for why.

### Root command set (from the root `package.json`)

```bash
bun install              # install all workspace dependencies

# Per-app dev servers (each `cd`s into the app and runs its own dev script)
bun run dev               # turbo dev --parallel --filter={next-app,@t4/api} — Next.js + API
bun run web                # apps/next dev server
bun run api                 # packages/api dev server (Hono on Miniflare)
bun run native              # apps/expo dev server
bun run desktop              # apps/tauri dev server (NOT cockpit — see note below)
bun run notes                 # apps/docs (Nextra) dev server
bun run cockpit                # turbo run dev --filter=cockpit — the cockpit app

# Building
bun run build              # builds packages/ui
bun run build:web           # apps/next production build
bun run build:ios / build:android / build:ios:preview / build:android:preview
bun run build:desktop        # apps/tauri production build
bun run cockpit:build         # turbo run build --filter=cockpit

# Type checking
bun run check-types         # tsc --noEmit across all workspaces

# Database (packages/api — Drizzle + Cloudflare D1)
bun run generate            # drizzle-kit generate migrations
bun run migrate:local / bun run seed:local
bun run migrate / bun run seed
bun run studio               # Drizzle Studio GUI

# Monorepo maintenance
bun run fix                 # manypkg fix — dependency version alignment
bun run check-deps          # check-dependency-version-consistency
bun run clean                # git clean -xdf node_modules && rm bun.lockb
bun run clean:workspaces      # turbo clean
```

> **`bun run desktop` is `apps/tauri`, not cockpit.** The two are unrelated Tauri apps — `apps/tauri`
> is a legacy shell wrapping the `apps/next` pages (see status table below); `apps/cockpit` is the
> real, actively developed desktop app. Use `bun run cockpit` (or `cd apps/cockpit && bun run tauri dev`)
> to run the actual product.

---

## Apps & Packages — Status

Status below is derived from actual commit history in this repository (`git log -- <path>`), not
assumption. This repo's history begins 2026-03-21 with a monorepo-wide scaffold import.

| Path            | Stack                                          | Status                                                                                        |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/cockpit`   | Tauri 2 + React 19 + Vite                       | ✅ **Active** — the product. All ongoing feature work happens here. See `apps/cockpit/AGENTS.md`. |
| `apps/next`      | Next.js 13.5 (Pages Router)                     | Legacy scaffold — untouched since import except one dependency security bump (Apr 2026). No feature work. |
| `apps/tauri`     | Tauri 1.4, wraps `apps/next` via Next.js pages  | Legacy scaffold — same security bump only, otherwise untouched since import.                  |
| `apps/docs`      | Nextra (Next.js-based docs site)                | Legacy scaffold — same security bump only, otherwise untouched since import.                  |
| `apps/expo`      | Expo 49 / React Native 0.72                     | Legacy scaffold — no commits since the initial import.                                        |
| `apps/cli`       | `create-t4-app` scaffolder CLI                  | Legacy scaffold — no commits since the initial import.                                        |
| `apps/vscode`    | "T4 App Tools" VS Code extension                | Legacy scaffold — no commits since the initial import.                                        |
| `packages/api`   | Hono + Cloudflare Workers + Drizzle + D1        | Legacy scaffold — same security bump only (miniflare SSRF fix), otherwise untouched since import. |
| `packages/app`   | Shared cross-platform screens (Solito)          | Legacy scaffold — no commits since the initial import.                                        |
| `packages/ui`    | Tamagui shared component library                | Legacy scaffold — no commits since the initial import.                                        |

In short: treat everything except `apps/cockpit` as inherited [T4 Stack](https://github.com/timothymiller/t4-app)
template scaffolding, kept only enough to stay dependency-patched. Do not assume feature parity,
active maintenance, or that patterns there reflect current best practice for this repo — cockpit's
own conventions (in `apps/cockpit/AGENTS.md`) are the ones actively enforced and reviewed.

---

## Navigating the Repo

```
apps/
  cockpit/    # ACTIVE — Tauri 2 + React 19 desktop app; see apps/cockpit/AGENTS.md
  next/       # legacy — Next.js 13.5 web app (Pages Router)
  tauri/      # legacy — Tauri 1.4 shell wrapping apps/next
  docs/       # legacy — Nextra documentation site
  expo/       # legacy — Expo / React Native mobile app
  cli/        # legacy — create-t4-app scaffolder
  vscode/     # legacy — VS Code extension
packages/
  api/        # legacy — Hono backend on Cloudflare Workers, Drizzle ORM, D1
  app/        # legacy — shared cross-platform screens (Solito navigation)
  ui/         # legacy — shared Tamagui component library
```

For anything inside `apps/cockpit/`, do not rely on this file or the legacy apps for patterns —
go straight to [`apps/cockpit/AGENTS.md`](apps/cockpit/AGENTS.md) and
[`apps/cockpit/documentation/`](apps/cockpit/documentation/README.md).

## Code Style (legacy apps/packages)

Prettier config (`.prettierrc`) applies repo-wide:
`semi: false`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`, `arrowParens: 'always'`.

Cockpit follows the same Prettier config but has its own additional non-negotiable rules — see
`apps/cockpit/AGENTS.md`.
