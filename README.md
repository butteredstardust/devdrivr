<div align="center">

# devdrivr

**A local-first, keyboard-driven developer workspace.**
**30 registered tools. One app. No browser, no cloud, no latency.**

[![Release](https://img.shields.io/github/v/release/butteredstardust/devdrivr?style=for-the-badge&logo=github&color=181717)](https://github.com/butteredstardust/devdrivr/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/butteredstardust/devdrivr/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/butteredstardust/devdrivr/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20%7C%20Linux%20%7C%20Windows-lightgrey?style=for-the-badge)](https://github.com/butteredstardust/devdrivr/releases/latest)

<br>

![devdrivr showing the Mermaid Editor in split view](screenshots/devdrivr-overview.png)

</div>

---

This repository contains the complete devdrivr desktop app and its developer documentation.

---

## Tech stack

| Layer         | Technology                             |
| ------------- | -------------------------------------- |
| Desktop shell | Tauri 2 (Rust + WebKit)                |
| UI            | React 19, TypeScript 5.9               |
| Styling       | Tailwind CSS 4, CSS custom properties  |
| State         | Zustand 5                              |
| Persistence   | SQLite via tauri-plugin-sql (WAL mode) |
| Build         | Vite 7                                 |
| Tests         | Vitest                                 |

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0`
- [Rust](https://rustup.rs) stable toolchain
- Tauri system dependencies — see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
# Install JS dependencies
bun install

# Start dev server (Vite + Tauri hot-reload)
bun run tauri dev

# Type-check
npx tsc --noEmit

# Run tests
bun run test

# Production build
bun run tauri build
```

Local `tauri build` output is unsigned like the released builds, so your own bundle will get the
same Gatekeeper or SmartScreen prompt as unsigned release artifacts.

---

## Project structure

```
devdrivr/
├── src/
│   ├── app/
│   │   ├── App.tsx               # Root layout (Sidebar + Workspace + overlays)
│   │   ├── providers.tsx         # Bootstrap: stores, window geometry, theme, update check
│   │   ├── tool-registry.ts      # Registered tools (lazy imports + metadata)
│   │   └── tool-groups.tsx       # Sidebar group definitions with Phosphor icons
│   ├── components/
│   │   ├── shell/                # Layout chrome (Sidebar, Workspace, SettingsPanel, etc.)
│   │   └── shared/               # Reusable UI (Button, Toggle, Toast, TabBar, etc.)
│   ├── hooks/
│   │   ├── useGlobalShortcuts.ts # All keyboard shortcuts
│   │   └── useFileDropZone.ts    # Drag-and-drop file loading
│   ├── stores/
│   │   ├── settings.store.ts     # Theme, sidebar state, editor prefs, update settings
│   │   ├── updater.store.ts      # GitHub release checker and installer download
│   │   ├── notes.store.ts        # Notes CRUD
│   │   ├── snippets.store.ts     # Snippets CRUD
│   │   └── history.store.ts      # Per-tool history
│   ├── lib/
│   │   ├── db.ts                 # SQLite singleton + all query functions
│   │   └── theme.ts              # applyTheme() with localStorage cache
│   ├── tools/                    # One folder per tool
│   │   └── <tool-id>/<ToolName>.tsx
│   └── types/
│       ├── models.ts             # Note, Snippet, HistoryEntry, AppSettings
│       └── tools.ts              # ToolDefinition, ToolGroupMeta
├── src-tauri/
│   ├── src/lib.rs                # Tauri builder + plugin registration
│   ├── capabilities/default.json # IPC permissions
│   ├── migrations/001_initial.sql
│   └── tauri.conf.json
└── index.html                    # Inline theme cache script
```

---

## Adding a new tool

1. Create `src/tools/<tool-id>/<ToolName>.tsx`
2. Add a lazy import in `src/app/tool-registry.ts`
3. Add an entry to `TOOLS` with `id`, `name`, `group`, `description`, `component`

Tool components receive no props. Use `dispatchToolAction` / `useToolActionListener` (from `src/lib/tool-actions.ts`) to communicate with the shell — for file open, execute, copy output, and tab switching.

---

## MCP server

devdrivr ships a local MCP server for CLI agents such as Codex CLI and Claude Code. It is disabled by
default, binds to `127.0.0.1:17347` only, defaults to read-only permissions, and authenticates with
a bearer token from Settings → MCP. See
[`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md) for setup commands, permissions, tools,
limits, and troubleshooting.

---

## Documentation

| Doc                                                                                                                | Description                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`documentation/README.md`](documentation/README.md)                                                               | Index of everything below                       |
| [`documentation/PRODUCT_MAP.md`](documentation/PRODUCT_MAP.md)                                                     | Full tool list, product status, shortcuts       |
| [`documentation/TODO.md`](documentation/TODO.md)                                                                   | Quality, bug-fix, and reliability backlog       |
| [`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md)                                                       | Local MCP server setup and agent tool reference |
| [`documentation/RELEASE_SMOKE_TESTS.md`](documentation/RELEASE_SMOKE_TESTS.md)                                     | Release-blocking smoke reports and validation   |
| [`documentation/ONBOARDING.md`](documentation/ONBOARDING.md)                                                       | First-time setup for new contributors           |
| [`documentation/TESTING.md`](documentation/TESTING.md)                                                             | Test strategy and coverage map                  |
| [`documentation/DESIGN_SYSTEM.md`](documentation/DESIGN_SYSTEM.md)                                                 | Color tokens, typography, component patterns    |
| [`documentation/HARNESSES.md`](documentation/HARNESSES.md)                                                         | Which debugging harness to reach for            |
| [`documentation/infrastructure/CODING_PATTERNS.md`](documentation/infrastructure/CODING_PATTERNS.md)               | Patterns to follow before writing any code      |
| [`documentation/infrastructure/ARCHITECTURE_DECISIONS.md`](documentation/infrastructure/ARCHITECTURE_DECISIONS.md) | ADRs — why things are the way they are          |
| [`documentation/infrastructure/TROUBLESHOOTING.md`](documentation/infrastructure/TROUBLESHOOTING.md)               | When something breaks                           |

[`AGENTS.md`](AGENTS.md) is the canonical ruleset for coding in this app;
[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the contribution workflow.

---

## License

MIT
</content>
