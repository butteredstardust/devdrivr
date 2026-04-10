# devdrivr cockpit

> A local-first, keyboard-driven developer utility workspace. 28 tools in a single Tauri desktop app — no browser, no cloud, no latency.

![Platform: macOS, Windows, Linux](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333333?style=flat)
![License: MIT](https://img.shields.io/badge/license-MIT-39ff14?style=flat)
![Tests: 604 passing](https://img.shields.io/badge/tests-604%20passing-39ff14?style=flat)

## Table of Contents

- [What is cockpit?](#what-is-cockpit)
- [Quick Start](#quick-start)
- [Tools](#tools)
- [Shell Features](#shell-features)
- [For Users](#for-users)
  - [Getting Started](#getting-started)
  - [Essential Shortcuts](#essential-shortcuts)
  - [Common Workflows](#common-workflows)
  - [Data Storage](#data-storage)
  - [Settings \& Customization](#settings--customization)
- [For Developers](#for-developers)
- [Documentation](#documentation)

## What is cockpit?

devdrivr cockpit is a **native desktop application** that brings together 28 essential developer tools into a single, keyboard-driven interface. Think of it as your personal developer utility belt — always accessible, no cloud required, zero latency.

**Why cockpit?**

- **Keyboard-first**: Every action is accessible via keyboard shortcuts
- **Local-first**: Your data never leaves your machine
- **Instant**: No loading screens, no cloud round-trips
- **Persistent**: Remembers your setup, themes, notes, and history
- **Native**: Lives in your dock/taskbar, responds to system themes, handles files natively
- **Private**: No accounts, no telemetry, no cloud sync — your data stays on your device

## Quick Start

```bash
# Clone and run
git clone https://github.com/devdrivr/devdrivr.git
cd devdrivr/apps/cockpit
bun install
bun run tauri dev
```

See [ONBOARDING.md](documentation/ONBOARDING.md) for detailed setup instructions.

---

## Tools

### Code Group

| Tool                      | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| **Code Formatter**        | Format and beautify code in 12+ languages via Prettier                   |
| **TypeScript Playground** | Transpile TypeScript to JavaScript with type stripping                   |
| **Diff Viewer**           | Side-by-side or inline diffs with syntax highlighting                    |
| **Refactoring Toolkit**   | 12 regex-based transforms (var→let, Promise→async/await, require→import) |

### Data Group

| Tool                      | Description                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| **JSON Tools**            | Validate, format, minify, sort keys, tree view, JSON→XML conversion |
| **XML Tools**             | Validate, format, minify, XPath queries, JSON conversion            |
| **YAML Tools**            | Validate, format, sort keys, tree view, YAML↔JSON conversion        |
| **JSON Schema Validator** | Validate JSON against schemas with templates and inference          |
| **CSV Tools**             | View, edit, convert to/from JSON, analyze stats, generate schemas   |

### Web Group

| Tool                | Description                                             |
| ------------------- | ------------------------------------------------------- |
| **CSS Validator**   | Parse and validate CSS, report errors with line numbers |
| **HTML Validator**  | HTMLHint-based validation with error/warning counts     |
| **CSS Specificity** | Calculate and compare selector specificity scores       |
| **CSS → Tailwind**  | Convert raw CSS properties to Tailwind utility classes  |

### Convert Group

| Tool                    | Description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| **Case Converter**      | Convert between 12 case formats (camelCase, snake_case, kebab-case, etc.)  |
| **Color Converter**     | Convert between hex/rgb/hsl/oklch, WCAG contrast checker, 148 named colors |
| **Timestamp Converter** | Unix timestamp ↔ human date, timezone-aware, relative time                 |
| **Base64**              | Encode/decode Base64, UTF-8 safe, file support                             |
| **URL Encode/Decode**   | URL encode/decode, query param extraction, double-encode detection         |
| **cURL → Fetch**        | Convert cURL commands to fetch, axios, ky, or XHR                          |
| **UUID Generator**      | Generate v1/v4/v7 UUIDs, validate, bulk export                             |
| **Hash Generator**      | MD5, SHA-1/256/512 hashes with comparison and export                       |

### Test Group

| Tool             | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| **Regex Tester** | Live regex matching with group extraction, infinite-loop guard |
| **JWT Decoder**  | Decode JWT header/payload/signature, expiry detection          |

### Network Group

| Tool             | Description                                                                    |
| ---------------- | ------------------------------------------------------------------------------ |
| **API Client**   | Full HTTP client with environments, collections, auth (Basic, Bearer, API Key) |
| **Docs Browser** | Embedded devdocs.io for offline-ish documentation browsing                     |

### Write Group

| Tool                 | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| **Markdown Editor**  | Split-pane edit + preview, GFM support, Mermaid diagrams, HTML export |
| **Mermaid Editor**   | Edit and preview Mermaid diagrams, SVG/PNG export, 7 templates        |
| **Snippets Manager** | CRUD code snippets with tags, favorites, fuzzy search, import/export  |

---

### Shell Features

- **Command palette** — `Cmd+K` fuzzy search all tools instantly
- **Notes drawer** — Persistent notes with color tags, search, and resizable width
- **History** — Per-tool input/output history that persists across sessions
- **Snippets** — Tagged code snippet library with favorites and fuzzy search
- **Keyboard shortcuts** — Full keyboard navigation (`Cmd+/` for reference)
- **13 themes** — Full customization with dark, light, and specialty themes
- **Always-on-top** — Pin over other windows
- **Window state** — Remembers size and position between sessions
- **Multi-tab workspaces** — Work on 3 parallel tasks with `Cmd+1/2/3`

### Available Themes

| Theme                    | Description                            |
| ------------------------ | -------------------------------------- |
| **Midnight**             | Deep blue-black with cyan accents      |
| **Neon Brutalist**       | High contrast with neon green          |
| **Warm Terminal**        | Amber/green phosphor monitor aesthetic |
| **Tokyo Night**          | Dark with purple/blue undertones       |
| **Tokyo Night Light**    | Light variant of Tokyo Night           |
| **Catppuccin Latte**     | Light warm beige with soft colors      |
| **Catppuccin Frappe**    | Muted pastels with gray undertones     |
| **Catppuccin Macchiato** | Dark with vibrant accent colors        |
| **Catppuccin Mocha**     | Deep brown with purple/blue highlights |
| **Cyber Luxe**           | Dark with gold/bronze accents          |
| **Earth Code**           | Warm earth tones, muted greens         |
| **Soft Focus**           | Low contrast, easy on the eyes         |
| **System**               | Follows your OS preference             |

---

## For Users

### Getting Started

1. **Launch the app** — `bun run tauri dev` or use the built app
2. **Open command palette** — Press `Cmd+K` to see all tools
3. **Start typing** — Fuzzy search finds the tool you need
4. **Execute** — Press `Cmd+Enter` to run/formate/convert

### Essential Shortcuts

| Shortcut      | Action                             |
| ------------- | ---------------------------------- |
| `Cmd+K`       | Command palette (search all tools) |
| `Cmd+B`       | Toggle sidebar                     |
| `Cmd+Shift+N` | Toggle notes drawer                |
| `Cmd+Enter`   | Execute current tool               |
| `Cmd+Shift+C` | Copy output to clipboard           |
| `Cmd+,`       | Open settings                      |
| `Cmd+Shift+T` | Cycle through themes               |
| `Cmd+Shift+P` | Toggle always-on-top               |
| `Cmd+/`       | Keyboard shortcuts reference       |
| `Cmd+]`       | Next tool                          |
| `Cmd+[`       | Previous tool                      |
| `Cmd+1/2/3`   | Switch workspace tabs              |
| `Cmd+W`       | Close current workspace tab        |
| `Cmd+O`       | Open file into current tool        |
| `Cmd+S`       | Save tool output to file           |

> **Note:** On Windows/Linux, replace `Cmd` with `Ctrl`

### Common Workflows

**Quick File Processing**

1. Drag and drop a file onto the app (or `Cmd+O`)
2. The app auto-detects the format (JSON, YAML, CSV, etc.)
3. Select the appropriate tool from the command palette (`Cmd+K`)
4. Use `Cmd+Enter` to process, `Cmd+Shift+C` to copy result

**API Testing**

1. Open API Client (`Cmd+K` → type "api")
2. Create an environment with your base URL and headers
3. Build requests with query params, body, and auth
4. Save requests to collections for reuse
5. Response shows status, timing, headers, and body

**Note-Taking**

1. Open the notes drawer (`Cmd+Shift+N`)
2. Create notes with color tags
3. Notes persist across sessions
4. Search through all notes instantly

### Data Storage

All your data lives locally in:

- **macOS**: `~/Library/Application Support/com.devdrivr.cockpit/cockpit.db`
- **Windows**: `%APPDATA%\com.devdrivr.cockpit\cockpit.db`
- **Linux**: `~/.local/share/com.devdrivr.cockpit/cockpit.db`

The database is a SQLite file that stores: settings, tool state, notes, snippets, history, API environments, and collections.

### Settings & Customization

Press `Cmd+,` to open settings and customize:

- **Theme**: Choose from 13 themes or follow system
- **Editor font**: JetBrains Mono, Fira Code, Cascadia Code, or Source Code Pro
- **Editor size**: 12-20px
- **Editor theme**: Match app or cockpit-specific themes
- **Default indentation**: 2 or 4 spaces
- **Timezone**: For timestamp conversions
- **History retention**: How many entries per tool to keep (default 500)
- **Format on paste**: Auto-format JSON/JSON when pasting
- **Keybinding mode**: Standard, Vim, or Emacs bindings for the editor

### Data Portability

All your data is in one SQLite file — easy to:

- **Backup**: Copy the `.db` file to backup
- **Export**: Snippets support JSON export/import
- **Reset**: Delete the database to start fresh (app recreates schema on launch)

---

## For Developers

### Prerequisites

- [Bun](https://bun.sh) `>= 1.0` — Package manager and runtime
- [Rust](https://rustup.rs) stable toolchain — For Tauri
- Platform-specific dependencies — See [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

### Development Commands

```bash
cd apps/cockpit

# Install dependencies (run first after clone)
bun install

# Start dev server (Vite + Tauri with hot-reload)
bun run tauri dev

# Production build (creates .app/.exe/.AppImage)
bun run tauri build

# Type-check (must pass before commit)
npx tsc --noEmit

# Run tests (604 tests)
bun run test

# Watch mode during development
bun run test:watch

# Clean build artifacts
bun run clean
```

### Debugging

```bash
# Open DevTools in Tauri (macOS)
Cmd+Option+I

# Open DevTools in Tauri (Windows/Linux)
Ctrl+Shift+I

# Check for TypeScript errors
npx tsc --noEmit

# Inspect SQLite database
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db ".tables"
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db "SELECT * FROM settings"

# View app logs
# macOS: Console.app → filter by "cockpit"
# Linux: ~/.local/share/com.devdrivr.cockpit/logs/
```

### Project Structure

```
apps/cockpit/
├── src/
│   ├── app/
│   │   ├── App.tsx              # Root layout (Sidebar + Workspace + Drawer + overlays)
│   │   ├── providers.tsx        # Bootstrap: stores, window geometry, theme init
│   │   ├── tool-registry.ts     # SINGLE SOURCE OF TRUTH: all 28 tools
│   │   └── tool-groups.tsx      # Sidebar group definitions with Phosphor icons
│   ├── components/
│   │   ├── shell/               # Layout chrome (Sidebar, Workspace, StatusBar, etc.)
│   │   └── shared/              # Reusable UI (Button, Toggle, Toast, TabBar, etc.)
│   ├── hooks/                   # Custom hooks (useToolState, useWorker, useGlobalShortcuts, etc.)
│   ├── stores/                  # Zustand stores (settings, notes, snippets, history, ui)
│   ├── lib/
│   │   ├── db.ts                # SQLite singleton via getDb() - NEVER use Database.load()
│   │   └── theme.ts             # applyTheme() - ONLY call inside async init
│   ├── tools/                   # 28 tool components (one folder per tool)
│   │   ├── <tool-id>/
│   │   │   └── <ToolName>.tsx   # Tool component
│   │   ├── api-client/
│   │   │   └── ApiClient.tsx    # Full HTTP client
│   │   └── ...
│   ├── workers/                 # Web Workers (for CPU-intensive tasks)
│   │   ├── rpc.ts               # RPC handler (replaces Comlink)
│   │   └── *.worker.ts          # Worker files
│   └── types/
│       ├── models.ts            # AppSettings, Note, Snippet, HistoryEntry types
│       └── tools.ts             # ToolDefinition, ToolGroupMeta types
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs               # Tauri builder + plugin registration
│   │   └── main.rs              # App entry point
│   ├── capabilities/
│   │   └── default.json         # IPC permissions (add new APIs here)
│   ├── migrations/
│   │   └── 001_initial.sql      # SQLite schema (WAL mode)
│   └── tauri.conf.json          # Window config, bundle settings, app ID
├── index.html                    # Entry HTML with theme cache script
├── package.json                  # Dependencies + scripts
├── vite.config.ts               # Vite bundler config
└── tailwind.config.js           # Tailwind CSS config
```

### Adding a New Tool

**Step 1:** Create `src/tools/<tool-id>/<ToolName>.tsx`

```typescript
import { useToolState } from '@/hooks/useToolState'
import { useToolAction } from '@/hooks/useToolAction'
import { useUiStore } from '@/stores/ui.store'

type MyToolState = {
  input: string
  output: string
}

export default function MyTool() {
  const [state, updateState] = useToolState<MyToolState>('my-tool', {
    input: '',
    output: '',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)

  useToolAction(async (action) => {
    if (action.type === 'execute') await handleRun()
    if (action.type === 'copy-output') navigator.clipboard.writeText(state.output)
    if (action.type === 'open-file') updateState({ input: action.content })
  })

  const handleRun = useCallback(async () => {
    // ... do work ...
    setLastAction('Done', 'success')
  }, [state.input, updateState, setLastAction])

  return <div className="flex h-full flex-col">...</div>
}
```

**Step 2:** Add lazy import in `src/app/tool-registry.ts`

```typescript
const MyTool = lazy(() => import('@/tools/my-tool/MyTool'))
```

**Step 3:** Add entry to `TOOLS` array

```typescript
{
  id: 'my-tool',
  name: 'My Tool',
  group: 'convert', // code | data | web | convert | test | network | write
  component: MyTool,
  keywords: ['keyword1', 'keyword2'],
}
```

### Key Architectural Patterns

| Pattern           | Location                    | Description                                     |
| ----------------- | --------------------------- | ----------------------------------------------- |
| **Tool Registry** | `src/app/tool-registry.ts`  | Single source of truth for all 28 tools         |
| **DB Access**     | `src/lib/db.ts`             | Always use `getDb()` — never `Database.load()`  |
| **Theme**         | `src/lib/theme.ts`          | `applyTheme()` only inside async init functions |
| **Tool State**    | `src/hooks/useToolState.ts` | In-memory cache + debounced SQLite write        |
| **Shell Actions** | `src/lib/tool-actions.ts`   | Pub/sub for tool↔shell communication            |

### Important Rules

- **Bun only** — Never use `npm` or `yarn`
- **CSS variables** — Use `var(--color-*)` tokens, never hardcoded colors
- **Worker imports** — Use `?worker` suffix, never `new Worker(..., { type: 'module' })`
- **No StrictMode** — React.StrictMode causes double-mount flash in Tauri
- **No new windows** — IPC scoping issues; use drawers/panels instead
- **DPI conversion** — Always convert physical→logical for window APIs

### Testing

```bash
# Run all tests
bun run test

# Watch mode during development
bun run test:watch

# Run specific test file
bun run test -- src/tools/__tests__/json-tools.test.ts
```

Tests are in `src/__tests__/`, `src/**/__tests__/`, and alongside components.

### Debugging

```bash
# Open DevTools in Tauri (macOS)
Cmd+Option+I

# Check for TypeScript errors
npx tsc --noEmit

# Inspect SQLite database
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db
```

### Pre-Commit Hook

The project runs checks before each commit:

- TypeScript compilation (`tsc --noEmit`)
- Test suite (`bun run test`)
- No `Database.load()` outside `db.ts`
- No hardcoded colors
- No `React.StrictMode`
- No module workers (`?worker` only)
- No `npm`/`yarn` commands

### SQLite Schema Quick Reference

```sql
settings         (key TEXT PRIMARY KEY, value TEXT)         -- JSON values
tool_state       (tool_id TEXT PRIMARY KEY, state TEXT, updated_at INTEGER)
notes            (id, title, content, color, pinned, tags, created_at, updated_at)
snippets         (id, title, content, language, tags, created_at, updated_at)
history          (id, tool, sub_tab, input, output, timestamp)
api_environments  (id, name, base_url, headers, created_at, updated_at)
api_collections  (id, name, description, created_at, updated_at)
api_requests     (id, collection_id, name, method, url, headers, body, ...)
```

### Tech Stack

| Layer       | Technology                             |
| ----------- | -------------------------------------- |
| Desktop     | Tauri 2 (Rust + WebKit)                |
| UI          | React 19, TypeScript 5.9               |
| Styling     | Tailwind CSS 4, CSS custom properties  |
| State       | Zustand 5                              |
| Persistence | SQLite (WAL mode) via tauri-plugin-sql |
| Build       | Vite 7                                 |
| Tests       | Vitest (604 tests)                     |

---

## Documentation

Comprehensive docs in the [documentation](documentation/) directory:

**User Guides**

- [QUICK_START.md](documentation/QUICK_START.md) — Get up and running
- [USER_GUIDE.md](documentation/USER_GUIDE.md) — Complete user guide
- [PRODUCT_MAP.md](documentation/PRODUCT_MAP.md) — Tool inventory and shortcuts

**Developer Resources**

- [ONBOARDING.md](documentation/ONBOARDING.md) — First-time setup
- [CODING_PATTERNS.md](documentation/infrastructure/CODING_PATTERNS.md) — Code patterns to follow
- [TESTING.md](documentation/TESTING.md) — Testing strategy
- [DEPLOYMENT.md](documentation/DEPLOYMENT.md) — Release process
- [ARCHITECTURE_DECISIONS.md](documentation/infrastructure/ARCHITECTURE_DECISIONS.md) — Technical decisions (ADRs)

**API Reference**

- [API_COMPONENTS.md](documentation/API_COMPONENTS.md) — Components, hooks, libraries
- [DIRECTORY_MAP.md](documentation/infrastructure/DIRECTORY_MAP.md) — File locations

---

## License

MIT — See main project repository.
