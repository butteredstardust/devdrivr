<div align="center">

# devdrivr cockpit

**A local-first, keyboard-driven developer workspace.**
**27 tools. One app. No browser, no cloud, no latency.**

[![Release](https://img.shields.io/github/v/release/butteredstardust/devdrivr?style=for-the-badge&logo=github&color=181717)](https://github.com/butteredstardust/devdrivr/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/butteredstardust/devdrivr/cockpit-ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/butteredstardust/devdrivr/actions/workflows/cockpit-ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](../../LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey?style=for-the-badge)](https://github.com/butteredstardust/devdrivr/releases/latest)

<br>

![devdrivr cockpit](../../screenshots/Screenshot%202026-04-06%20at%2023.00.12.png)

</div>

---

## Tools

Everything you reach for during a coding session — in one keyboard-driven app.

| Group       | Tools                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Code**    | Code Formatter · TypeScript Playground · Diff Viewer · Refactoring Toolkit                                                 |
| **Data**    | JSON Tools · XML Tools · YAML Tools · JSON Schema Validator                                                                |
| **Web**     | CSS Validator · HTML Validator · CSS Specificity · CSS → Tailwind                                                          |
| **Convert** | Case Converter · Color Converter · Timestamp Converter · Base64 · URL Encode/Decode · cURL → Fetch · UUID Generator · Hash |
| **Test**    | Regex Tester · JWT Decoder                                                                                                 |
| **Network** | API Client · Docs Browser                                                                                                  |
| **Write**   | Markdown Editor · Mermaid Editor · Snippets Manager                                                                        |

### Shell features

- **Command palette** — fuzzy search every tool (`Cmd+K`)
- **Notes drawer** — persistent notes with color tags and full-text search
- **Per-tool history** — inputs and outputs are saved automatically
- **Snippets library** — tagged code snippets accessible from any tool
- **MCP server** — local agent access for notes, snippets, prompt templates, and saved API requests
- **Themes** — 7 built-in themes including dark, light, and system
- **Always-on-top** — pin the window over your editor or browser
- **Window state persistence** — remembers size and position across launches
- **Auto-updater** — checks GitHub releases and prompts you when a new version is available

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
cd apps/cockpit

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

> [!NOTE]
> Run all commands from `apps/cockpit/`, not the monorepo root.

---

## Keyboard shortcuts

| Shortcut      | Action                       |
| ------------- | ---------------------------- |
| `Cmd+K`       | Command palette              |
| `Cmd+B`       | Toggle sidebar               |
| `Cmd+]` / `[` | Next / previous tool         |
| `Cmd+Shift+N` | Toggle notes drawer          |
| `Cmd+Enter`   | Execute / run                |
| `Cmd+Shift+C` | Copy output                  |
| `Cmd+1/2/3`   | Switch sub-tab               |
| `Cmd+O`       | Open file                    |
| `Cmd+S`       | Save file                    |
| `Cmd+,`       | Settings                     |
| `Cmd+Shift+T` | Toggle theme                 |
| `Cmd+Shift+P` | Toggle always-on-top         |
| `Cmd+/`       | Keyboard shortcuts reference |

---

## Themes

| Theme            | Description                    |
| ---------------- | ------------------------------ |
| `system`         | Follows OS light/dark setting  |
| `midnight`       | Deep dark — default dark theme |
| `warm-terminal`  | Amber tones on dark            |
| `neon-brutalist` | High contrast, vivid accents   |
| `earth-code`     | Muted greens and browns        |
| `cyber-luxe`     | Purple and gold on dark        |
| `soft-focus`     | Soft light theme               |

Cycle themes with `Cmd+Shift+T` or set one in Settings (`Cmd+,`).

---

## MCP server

cockpit includes a local MCP server for CLI agents such as Codex CLI and Claude Code.
When enabled in Settings, it starts with the app and exposes authenticated tools for
notes, snippets, prompt templates, saved API client requests, search, schema
introspection, and topic-based help.

Key details:

- Binds to `127.0.0.1` only.
- Default URL: `http://127.0.0.1:17347/mcp`.
- Uses a bearer token copied from Settings → MCP.
- Defaults to read-only permissions.
- Redacts saved API request auth secrets unless explicitly allowed.

See [`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md) for setup commands,
permissions, tools, limits, and troubleshooting.

---

## Project structure

```
apps/cockpit/
├── src/
│   ├── app/
│   │   ├── App.tsx               # Root layout (Sidebar + Workspace + overlays)
│   │   ├── providers.tsx         # Bootstrap: stores, window geometry, theme, update check
│   │   ├── tool-registry.ts      # All 27 tools (lazy imports + metadata)
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

## App updater

cockpit checks [GitHub releases](https://github.com/butteredstardust/devdrivr/releases) for new versions against a `latest.json` manifest published on every release. No account or signing key required — pure HTTP, fully local.

**Update settings** (in Settings → General):

| Setting                         | Default | Description                                        |
| ------------------------------- | ------- | -------------------------------------------------- |
| Check for updates automatically | On      | Checks once per hour in the background             |
| Download update automatically   | Off     | Saves installer to Downloads folder silently       |
| Notify when update available    | On      | Shows a dismissible banner when an update is found |

You can always trigger a manual check with the **Check Now** button in Settings.

---

## Documentation

| Doc                                                                                                                | Description                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| [`documentation/PRODUCT_MAP.md`](documentation/PRODUCT_MAP.md)                                                     | Full tool list, product status, shortcuts       |
| [`documentation/MCP_SERVER.md`](documentation/MCP_SERVER.md)                                                       | Local MCP server setup and agent tool reference |
| [`documentation/ONBOARDING.md`](documentation/ONBOARDING.md)                                                       | First-time setup for new contributors           |
| [`documentation/TESTING.md`](documentation/TESTING.md)                                                             | Test strategy and coverage map                  |
| [`documentation/DESIGN_SYSTEM.md`](documentation/DESIGN_SYSTEM.md)                                                 | Color tokens, typography, component patterns    |
| [`documentation/infrastructure/CODING_PATTERNS.md`](documentation/infrastructure/CODING_PATTERNS.md)               | Patterns to follow before writing any code      |
| [`documentation/infrastructure/ARCHITECTURE_DECISIONS.md`](documentation/infrastructure/ARCHITECTURE_DECISIONS.md) | ADRs — why things are the way they are          |
| [`documentation/infrastructure/TROUBLESHOOTING.md`](documentation/infrastructure/TROUBLESHOOTING.md)               | When something breaks                           |

---

## License

MIT
