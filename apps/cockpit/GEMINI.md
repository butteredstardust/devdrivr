# GEMINI.md — devdrivr cockpit

Instructions for Gemini CLI working in `apps/cockpit`.

**Canonical ruleset:** [`AGENTS.md`](./AGENTS.md) in this directory has the full development
workflow, git/commit conventions, non-negotiable coding rules, file map, established patterns, and
submission checklist. Read that first — this file only covers what's specific to Gemini CLI.

---

## What This Project Is

**devdrivr cockpit** is a local-first, keyboard-driven developer utility desktop app.

- **Runtime**: Tauri 2 (Rust backend + WKWebView frontend)
- **UI**: React 19 + TypeScript 5.9 + Tailwind CSS 4
- **State**: Zustand 5 stores → SQLite (WAL mode) via `@tauri-apps/plugin-sql`
- **Build**: Vite 7 + Bun (package manager)
- **30 registered tools** across 7 groups (Code, Data, Web, Convert, Test, Network, Write)
- **No cloud, no accounts** — everything runs locally

## Commands (always run from `apps/cockpit/`)

```bash
bun install              # install/restore dependencies
bun run tauri dev        # start dev server (Vite + Tauri hot-reload)
bun run clean            # delete node_modules, dist, src-tauri/target
bun run dev              # Vite-only web preview (no Tauri shell, no native APIs)
bun run build            # tsc --noEmit + vite build — must pass before submitting
bunx vitest run          # run Vitest tests — must all pass
bun run lint             # ESLint across src/
bun run tauri build      # production build
```

---

## Documentation index

Full canonical docs live in [`documentation/`](./documentation/). Start with
[`documentation/README.md`](./documentation/README.md) for the index, or
[`documentation/PRODUCT_MAP.md`](./documentation/PRODUCT_MAP.md) for product status and the full
30-tool list.
