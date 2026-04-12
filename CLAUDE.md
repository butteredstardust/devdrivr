# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**devdrivr** is a Turborepo monorepo. Active development is focused on `apps/cockpit` — a local-first, keyboard-driven developer utility workspace built with Tauri 2 + React 19.

> For cockpit-specific guidance see `apps/cockpit/CLAUDE.md`.

The broader monorepo is the **T4 Stack** for building universal TypeScript apps (iOS, Android, Web, Desktop) targeting Cloudflare's edge platform.

## Package Manager & Build System

- **Package manager:** Bun (`bun.lockb` is the lockfile — never use npm/yarn)
- **Build orchestration:** Turborepo (`turbo.json`)

## Common Commands

```bash
# Start all dev servers (Next.js + API in parallel)
bun run dev

# Individual apps
bun run web          # Next.js web app
bun run api          # Hono API (Cloudflare Workers)
bun run native       # Expo dev
bun run desktop      # Tauri desktop
bun run notes        # Nextra docs site

# Type checking
bun run check-types  # tsc --noEmit across all packages
cd apps/cockpit && npx tsc --noEmit  # type-check cockpit specifically

# Database
bun run generate     # drizzle-kit generate migrations
bun run migrate:local  # Apply D1 migrations locally
bun run seed:local     # Seed local database
bun run studio         # Drizzle Studio GUI

# Building
bun run build:web    # Next.js production build
bun run build:ios    # EAS iOS build
bun run build:android # EAS Android build

# Monorepo maintenance
bun run fix          # manypkg fix (dependency version alignment)
bun run clean        # Remove node_modules & lockfile
```

## Monorepo Structure

```
apps/
  next/       # Web — Next.js 13.5 (Pages Router, not App Router)
  expo/       # Mobile — Expo 49 / React Native 0.72
  tauri/      # Desktop — Tauri 1.4 (wraps Next.js)
  docs/       # Documentation — Nextra
  cli/        # create-t4-app CLI scaffolder
  vscode/     # T4 App Tools VSCode extension
packages/
  api/        # Backend — Hono on Cloudflare Workers, Drizzle ORM, D1 SQLite
  app/        # Shared cross-platform screens and logic
  ui/         # Shared Tamagui component library
```

## Architecture

### Cross-Platform Strategy

- **Solito** provides shared navigation across Next.js and Expo
- **Tamagui** components in `packages/ui` render on all platforms
- Platform-specific files use `.web.ts` / `.native.ts` extensions
- `packages/app` holds shared screens; each app shell imports them

### Data Flow

- All frontends call the backend via **tRPC** (type-safe end-to-end)
- Backend runs as **Cloudflare Workers** (Hono framework)
- Database: **Cloudflare D1** (edge SQLite), schema in `packages/api/src/db/schema.ts`
- ORM: **Drizzle** with migrations in `packages/api/migrations/`
- Auth: **Supabase Auth** (JWT), verified in Workers via `@tsndr/cloudflare-worker-jwt`
- Client state: **Jotai** atoms; server state: **TanStack Query**

### TypeScript Path Aliases

```
app/*       → packages/app/*
@t4/api/*   → packages/api/*
@t4/ui/*    → packages/ui/*
```

## Code Style

Prettier config (`.prettierrc`):

- `semi: false`
- `singleQuote: true`
- `trailingComma: 'es5'`
- `printWidth: 100`
- `arrowParens: 'always'`

## Environment Variables

Required (see `.env.example`):

```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_URL=
```

## Key Turbo Pipeline Notes

- `next-app#build` depends on `@t4/ui#build` — build UI package before web app
- `@t4/ui#build` outputs to `dist/` (must complete before app builds)
- `expo-app#postinstall` generates `.tamagui` (run after install)
- `dev` tasks have caching disabled and run persistently
