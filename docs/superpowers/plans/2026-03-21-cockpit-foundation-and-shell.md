# Developer Cockpit — Plan 1: Foundation & Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Tauri 2 desktop app with full shell UI (sidebar, workspace, notes drawer, command palette, status bar), theme system, SQLite storage, keyboard shortcuts, and one proof-of-concept tool (UUID Generator) to validate the architecture end-to-end.

**Architecture:** New app at `apps/cockpit/` — Tauri 2 Rust backend handles SQLite, filesystem, and window management via IPC. React frontend renders the shell and tools. Zustand stores persist to SQLite via custom adapter. All heavy processing runs in Web Workers via comlink. Tailwind CSS 4 handles styling with CSS custom properties for dark/light theming.

**Tech Stack:** Tauri 2, React 18, TypeScript (strict), Vite, Tailwind CSS 4, Zustand, Monaco Editor, SQLite (tauri-plugin-sql), comlink, fuse.js, nanoid

**Spec:** `/Users/tuxgeek/Dev/devdrivr/developer_cockpit_prd.md`

**Plan series:**
- **Plan 1 (this):** Foundation & Shell
- **Plan 2:** Editor-Based Tools (JSON, Formatter, XML, Diff, Markdown, Mermaid, TS Playground, Refactoring)
- **Plan 3:** Utility Tools (16 converters, validators, testers, generators)
- **Plan 4:** System Features (Notes, Snippets, History, API Client, Docs Browser, cross-tool flow)

---

## File Structure

```
apps/cockpit/
├── src-tauri/
│   ├── src/
│   │   └── main.rs                          # Tauri entry point, plugin registration, migrations
│   │   # NOTE: Rust IPC commands (settings.rs, tool_state.rs, window.rs) deferred to Plan 4.
│   │   # All DB access in Plan 1 goes through tauri-plugin-sql's JS API directly.
│   ├── migrations/
│   │   └── 001_initial.sql                  # All tables: settings, tool_state, snippets, notes, history
│   ├── capabilities/
│   │   └── default.json                     # Tauri 2 permissions (window, sql, fs, http, shell, global-shortcut)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.tsx                             # React entry point, mounts App
│   ├── app/
│   │   ├── App.tsx                          # Shell layout: sidebar + workspace + drawer + status bar
│   │   ├── providers.tsx                    # ThemeProvider, ErrorBoundary wrapping
│   │   └── tool-registry.ts                # Central registry: tool metadata, lazy imports, groups, shortcuts
│   ├── components/
│   │   ├── shell/
│   │   │   ├── Sidebar.tsx                  # Icon rail with grouped tools, collapse toggle
│   │   │   ├── SidebarGroup.tsx             # Collapsible group with icon + tool list
│   │   │   ├── SidebarItem.tsx              # Single tool icon button with tooltip
│   │   │   ├── Workspace.tsx                # Suspense boundary, renders active tool via lazy import
│   │   │   ├── NotesDrawer.tsx              # Right drawer stub (full implementation in Plan 4)
│   │   │   ├── StatusBar.tsx                # Tool name, last action, theme toggle
│   │   │   └── CommandPalette.tsx           # Floating overlay, fuzzy search tools/actions
│   │   └── shared/
│   │       ├── ErrorBoundary.tsx            # Catches tool-level errors, shows fallback
│   │       ├── CopyButton.tsx               # Click-to-copy with "Copied!" feedback
│   │       └── TabBar.tsx                   # Horizontal tab bar for tool sub-modes
│   ├── tools/
│   │   └── uuid-generator/
│   │       ├── UuidGenerator.tsx            # Proof-of-concept tool
│   │       └── uuid-generator.test.tsx      # Component test
│   ├── stores/
│   │   ├── ui.store.ts                      # activeTool, sidebarCollapsed, drawerOpen, lastAction
│   │   ├── settings.store.ts                # AppSettings with SQLite persistence
│   │   └── tool-state.store.ts              # Per-tool state persistence
│   ├── lib/
│   │   ├── db.ts                            # Tauri SQL invoke wrappers (typed)
│   │   ├── keybindings.ts                   # Shortcut registry, OS-aware Cmd/Ctrl
│   │   ├── theme.ts                         # Apply theme class to <html>, CSS variable tokens
│   │   └── platform.ts                      # Detect OS, return modifier key label
│   ├── hooks/
│   │   ├── useKeyboardShortcut.ts           # Register/unregister a keyboard shortcut
│   │   ├── useToolState.ts                  # Per-tool persistent state hook
│   │   └── usePlatform.ts                   # Returns { isMac, modKey: 'Cmd' | 'Ctrl' }
│   └── types/
│       ├── tools.ts                         # ToolDefinition, ToolGroup, ToolId types
│       └── models.ts                        # AppSettings, ToolState, Note, Snippet, HistoryEntry
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

---

## Task 1: Scaffold Tauri 2 + Vite + React + TypeScript

**Files:**
- Create: `apps/cockpit/package.json`
- Create: `apps/cockpit/index.html`
- Create: `apps/cockpit/vite.config.ts`
- Create: `apps/cockpit/tsconfig.json`
- Create: `apps/cockpit/src/main.tsx`
- Create: `apps/cockpit/src-tauri/tauri.conf.json`
- Create: `apps/cockpit/src-tauri/Cargo.toml`
- Create: `apps/cockpit/src-tauri/src/main.rs`
- Create: `apps/cockpit/src-tauri/capabilities/default.json`
- Modify: `/Users/tuxgeek/Dev/devdrivr/package.json` (add `cockpit` workspace script)
- Modify: `/Users/tuxgeek/Dev/devdrivr/turbo.json` (add cockpit pipeline)

**Context:** Tauri 2 uses `@tauri-apps/cli@^2` and `@tauri-apps/api@^2`. The Vite plugin is `@tauri-apps/vite-plugin`. Check Tauri 2 docs at https://v2.tauri.app/start/create-project/ for the exact scaffolding commands and configuration format. Tauri 2 uses a `capabilities/` directory instead of the v1 `allowlist` in tauri.conf.json.

- [ ] **Step 1: Create the Tauri 2 app using the official scaffolder**

Run from the monorepo root:
```bash
cd /Users/tuxgeek/Dev/devdrivr
bun create tauri-app apps/cockpit --template vite-react-ts --manager bun
```

If the scaffolder doesn't support the `apps/cockpit` path directly, create it manually:
```bash
mkdir -p apps/cockpit
cd apps/cockpit
bun create tauri-app . --template vite-react-ts --manager bun
```

- [ ] **Step 2: Verify scaffolding produced expected files**

Run:
```bash
ls apps/cockpit/src-tauri/tauri.conf.json apps/cockpit/vite.config.ts apps/cockpit/src/main.tsx apps/cockpit/package.json
```
Expected: All four files exist.

- [ ] **Step 3: Update package.json with strict TypeScript and correct metadata**

Update `apps/cockpit/package.json`:
- Set `"name": "cockpit"`
- Set `"private": true`
- Ensure devDependencies include: `@tauri-apps/cli@^2`, `typescript@^5.4`, `@types/react@^18`, `@types/react-dom@^18`
- Ensure dependencies include: `react@^18`, `react-dom@^18`, `@tauri-apps/api@^2`, `@tauri-apps/plugin-sql@^2`, `@tauri-apps/plugin-fs@^2`, `@tauri-apps/plugin-http@^2`
- NOTE: `@tauri-apps/plugin-global-shortcut` deferred to Plan 4 (quick capture note hotkey)

- [ ] **Step 4: Configure strict TypeScript**

Update `apps/cockpit/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Configure Tauri 2 window settings**

Update `apps/cockpit/src-tauri/tauri.conf.json` — set:
- `productName`: `"devdrivr"`
- `identifier`: `"com.devdrivr.cockpit"`
- `windows[0]`: `{ "title": "devdrivr", "width": 1200, "height": 800, "minWidth": 800, "minHeight": 500, "decorations": true, "center": true }`
- `build.devUrl`: `"http://localhost:1420"` (Vite default for Tauri)
- `build.frontendDist`: `"../dist"`

- [ ] **Step 6: Add Tauri 2 plugins to Cargo.toml**

Update `apps/cockpit/src-tauri/Cargo.toml` dependencies:
```toml
[dependencies]
tauri = { version = "2", features = ["devtools"] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-fs = "2"
tauri-plugin-http = "2"
# tauri-plugin-global-shortcut deferred to Plan 4 (quick capture note hotkey)
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = "2"
```

- [ ] **Step 7: Register plugins in main.rs**

Update `apps/cockpit/src-tauri/src/main.rs`:
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Configure Tauri 2 capabilities**

Create `apps/cockpit/src-tauri/capabilities/default.json`:
```json
{
  "identifier": "default",
  "description": "Default permissions for the cockpit app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-maximize",
    "core:window:allow-minimize",
    "core:window:allow-unmaximize",
    "core:window:allow-unminimize",
    "core:window:allow-start-dragging",
    "core:window:allow-set-always-on-top",
    "core:window:allow-create",
    "core:window:allow-set-size",
    "core:window:allow-set-position",
    "sql:default",
    "fs:default",
    "http:default",
    "# global-shortcut:default — added in Plan 4"
  ]
}
```

- [ ] **Step 9: Add cockpit scripts to root package.json**

Add to root `package.json` scripts:
```json
"cockpit": "turbo run dev --filter=cockpit",
"cockpit:build": "turbo run build --filter=cockpit"
```

- [ ] **Step 10: Add cockpit pipeline to turbo.json**

Add to `turbo.json` pipeline:
```json
"cockpit#dev": {
  "cache": false,
  "persistent": true
},
"cockpit#build": {
  "outputs": ["dist/**", "src-tauri/target/**"]
}
```

- [ ] **Step 11: Install dependencies and verify the app launches**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun install
bun run tauri dev
```
Expected: A Tauri window opens showing the default Vite + React template page. Close the window.

- [ ] **Step 12: Commit**

```bash
git add apps/cockpit/ package.json turbo.json
git commit -m "feat(cockpit): scaffold Tauri 2 + Vite + React + TypeScript app"
```

---

## Task 2: Tailwind CSS 4 + Theme System

**Files:**
- Create: `apps/cockpit/tailwind.config.ts`
- Create: `apps/cockpit/src/lib/theme.ts`
- Create: `apps/cockpit/src/lib/platform.ts`
- Create: `apps/cockpit/src/hooks/usePlatform.ts`
- Modify: `apps/cockpit/src/main.tsx` (add theme initialization)
- Modify: `apps/cockpit/index.html` (add class="dark" default, font links)
- Create or modify: `apps/cockpit/src/index.css` (Tailwind directives + CSS custom properties)

**Context:** Tailwind CSS 4 uses `@tailwindcss/vite` plugin — no PostCSS config needed. Theme switching uses the `class` strategy on `<html>`. All colors defined as CSS custom properties. Check Tailwind v4 docs for the exact import syntax (it changed from v3).

- [ ] **Step 1: Install Tailwind CSS 4 and its Vite plugin**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite plugin**

Update `apps/cockpit/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
```

- [ ] **Step 3: Create CSS with theme tokens**

Create `apps/cockpit/src/index.css`:
```css
@import 'tailwindcss';

@theme {
  /* Pixel heading font */
  --font-pixel: 'Silkscreen', monospace;
  /* Code font */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

:root {
  /* Dark theme (default) */
  --color-bg: #0a0a0a;
  --color-surface: #1a1a1a;
  --color-surface-hover: #252525;
  --color-border: #333333;
  --color-text: #e0e0e0;
  --color-text-muted: #888888;
  --color-accent: #39ff14;
  --color-accent-dim: #1a7a0a;
  --color-error: #ff3333;
  --color-warning: #ffaa00;
  --color-success: #39ff14;
}

.light {
  --color-bg: #faf8f0;
  --color-surface: #ffffff;
  --color-surface-hover: #f0eee6;
  --color-border: #d4d0c8;
  --color-text: #1a1a1a;
  --color-text-muted: #666666;
  --color-accent: #00875a;
  --color-accent-dim: #b3e0d0;
  --color-error: #cc0000;
  --color-warning: #cc8800;
  --color-success: #00875a;
}

/* Global resets */
*, *::before, *::after {
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--color-bg);
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

/*
 * Animation cap: enforce via Tailwind's duration utilities (duration-100, duration-150).
 * Do NOT use !important — violates project rules. Instead, use consistent
 * utility classes and avoid custom transition-duration in components.
 */
```

- [ ] **Step 4: Add font links to index.html**

Install locally-bundled fonts (works offline — no Google Fonts CDN dependency):

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add @fontsource/jetbrains-mono @fontsource/silkscreen
```

Then import them at the top of `apps/cockpit/src/index.css`:
```css
@import '@fontsource/jetbrains-mono/400.css';
@import '@fontsource/jetbrains-mono/500.css';
@import '@fontsource/jetbrains-mono/600.css';
@import '@fontsource/jetbrains-mono/700.css';
@import '@fontsource/silkscreen/400.css';
@import '@fontsource/silkscreen/700.css';
```

Set `<html class="dark">` as default in `index.html`.

- [ ] **Step 5: Create platform detection utility**

Create `apps/cockpit/src/lib/platform.ts`:
```ts
export type Platform = 'mac' | 'windows' | 'linux'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return 'linux'
}

export function getModKey(platform: Platform): string {
  return platform === 'mac' ? 'Cmd' : 'Ctrl'
}

export function getModKeySymbol(platform: Platform): string {
  return platform === 'mac' ? '⌘' : 'Ctrl'
}
```

- [ ] **Step 6: Create platform hook**

Create `apps/cockpit/src/hooks/usePlatform.ts`:
```ts
import { useMemo } from 'react'
import { detectPlatform, getModKey, getModKeySymbol, type Platform } from '@/lib/platform'

export function usePlatform() {
  return useMemo(() => {
    const platform = detectPlatform()
    return {
      platform,
      isMac: platform === 'mac',
      modKey: getModKey(platform),
      modSymbol: getModKeySymbol(platform),
    }
  }, [])
}
```

- [ ] **Step 7: Create theme utility**

Create `apps/cockpit/src/lib/theme.ts`:
```ts
export type Theme = 'dark' | 'light' | 'system'

export function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  const html = document.documentElement
  html.classList.remove('dark', 'light')
  html.classList.add(effective)
}
```

- [ ] **Step 8: Update main.tsx to import CSS and apply theme**

Update `apps/cockpit/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { applyTheme } from '@/lib/theme'

// Apply default theme immediately to prevent flash
applyTheme('system')

function App() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="font-pixel text-2xl text-[var(--color-accent)]">devdrivr</h1>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 9: Verify theme works**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```
Expected: Window opens with dark background (#0a0a0a), "devdrivr" text in retro green (#39ff14), rendered in pixel font.

- [ ] **Step 10: Commit**

```bash
git add apps/cockpit/
git commit -m "feat(cockpit): add Tailwind CSS 4 with dark/light theme system"
```

---

## Task 3: SQLite Database Setup

**Files:**
- Create: `apps/cockpit/src-tauri/src/db.rs`
- Create: `apps/cockpit/src-tauri/migrations/001_initial.sql`
- Create: `apps/cockpit/src/lib/db.ts`
- Create: `apps/cockpit/src/types/models.ts`
- Modify: `apps/cockpit/src-tauri/src/main.rs` (register db module)

**Context:** `tauri-plugin-sql` v2 provides a JavaScript API via `@tauri-apps/plugin-sql`. The plugin handles database creation and connection. Migrations can be run from the Rust side or via SQL from the JS side. Use WAL mode for performance. Check the tauri-plugin-sql v2 docs for the exact initialization API.

- [ ] **Step 1: Create the migration file**

Create `apps/cockpit/src-tauri/migrations/001_initial.sql`:
```sql
-- NOTE: WAL mode is set at connection time in main.rs, not here.
-- PRAGMA journal_mode=WAL cannot run inside a migration transaction.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_state (
  tool_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snippets_updated ON snippets(updated_at);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  pinned INTEGER NOT NULL DEFAULT 0,
  popped_out INTEGER NOT NULL DEFAULT 0,
  window_x REAL,
  window_y REAL,
  window_width REAL,
  window_height REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned, updated_at);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  sub_tab TEXT,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_tool ON history(tool, timestamp);
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
```

- [ ] **Step 2: Configure the SQL plugin to run migrations**

Update `apps/cockpit/src-tauri/src/main.rs`:
```rust
use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:cockpit.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        // NOTE: tauri_plugin_global_shortcut deferred to Plan 4 (quick capture note).
        // Not registered here to avoid dead-weight dependency.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Important:** WAL mode must be set at connection time, not in a migration. After the app launches, the JS side should run this as the first query after `Database.load()`:
```ts
await db.execute('PRAGMA journal_mode=WAL')
```
This is handled in `db.ts` (see Step 4).
```

- [ ] **Step 3: Create TypeScript data models**

Create `apps/cockpit/src/types/models.ts`:
```ts
export type Theme = 'dark' | 'light' | 'system'

export type AppSettings = {
  theme: Theme
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  notesDrawerOpen: boolean
  defaultIndentSize: number
  defaultTimezone: string
  editorFontSize: number
  editorKeybindingMode: 'standard' | 'vim' | 'emacs'
  historyRetentionPerTool: number
  formatOnPaste: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  alwaysOnTop: false,
  sidebarCollapsed: false,
  notesDrawerOpen: false,
  defaultIndentSize: 2,
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  editorFontSize: 14,
  editorKeybindingMode: 'standard',
  historyRetentionPerTool: 500,
  formatOnPaste: false,
}

export type ToolState = {
  toolId: string
  state: Record<string, unknown>
  updatedAt: number
}

export type Snippet = {
  id: string
  title: string
  content: string
  language: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange' | 'red' | 'gray'

export type Note = {
  id: string
  title: string
  content: string
  color: NoteColor
  pinned: boolean
  poppedOut: boolean
  windowBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  createdAt: number
  updatedAt: number
}

export type HistoryEntry = {
  id: string
  tool: string
  subTab?: string
  input: string
  output: string
  timestamp: number
}
```

- [ ] **Step 4: Create typed database wrapper**

Create `apps/cockpit/src/lib/db.ts`:
```ts
import Database from '@tauri-apps/plugin-sql'

let db: Database | null = null

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:cockpit.db')
    // WAL mode for concurrent reads — must be set at connection time, not in migrations
    await db.execute('PRAGMA journal_mode=WAL')
  }
  return db
}

// --- Settings ---

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ value: string }>>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  )
  if (rows.length === 0) return fallback
  return JSON.parse(rows[0]!.value) as T
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, JSON.stringify(value)]
  )
}

// --- Tool State ---

export async function loadToolState(toolId: string): Promise<Record<string, unknown> | null> {
  const conn = await getDb()
  const rows = await conn.select<Array<{ state: string }>>(
    'SELECT state FROM tool_state WHERE tool_id = $1',
    [toolId]
  )
  if (rows.length === 0) return null
  return JSON.parse(rows[0]!.state) as Record<string, unknown>
}

export async function saveToolState(toolId: string, state: Record<string, unknown>): Promise<void> {
  const conn = await getDb()
  await conn.execute(
    'INSERT INTO tool_state (tool_id, state, updated_at) VALUES ($1, $2, $3) ON CONFLICT(tool_id) DO UPDATE SET state = $2, updated_at = $3',
    [toolId, JSON.stringify(state), Date.now()]
  )
}
```

- [ ] **Step 5: Verify database initialization**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```

Open the app, then verify the database was created. Check the Tauri app data directory for `cockpit.db`. On macOS: `~/Library/Application Support/com.devdrivr.cockpit/cockpit.db`. On Windows: `%APPDATA%/com.devdrivr.cockpit/cockpit.db`.

```bash
# macOS check
ls ~/Library/Application\ Support/com.devdrivr.cockpit/
sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db ".tables"
```
Expected: Output includes `settings`, `tool_state`, `snippets`, `notes`, `history`.

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/
git commit -m "feat(cockpit): add SQLite database with migrations and typed JS wrapper"
```

---

## Task 4: Zustand Stores

**Files:**
- Create: `apps/cockpit/src/stores/settings.store.ts`
- Create: `apps/cockpit/src/stores/ui.store.ts`
- Create: `apps/cockpit/src/stores/tool-state.store.ts`
- Create: `apps/cockpit/src/hooks/useToolState.ts`

**Context:** Zustand stores use `create` from `zustand`. For SQLite persistence, we write a custom storage adapter that calls our db.ts functions. Use `immer` middleware for complex state updates. Use atomic selectors everywhere.

- [ ] **Step 1: Install Zustand and immer**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add zustand immer
```

- [ ] **Step 2: Create settings store with SQLite persistence**

Create `apps/cockpit/src/stores/settings.store.ts`:
```ts
import { create } from 'zustand'
import { type AppSettings, DEFAULT_SETTINGS } from '@/types/models'
import { getSetting, setSetting } from '@/lib/db'
import { applyTheme } from '@/lib/theme'

type SettingsStore = AppSettings & {
  initialized: boolean
  init: () => Promise<void>
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  toggleTheme: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  initialized: false,

  init: async () => {
    const saved = await getSetting<Partial<AppSettings>>('appSettings', {})
    const merged = { ...DEFAULT_SETTINGS, ...saved }
    set({ ...merged, initialized: true })
    applyTheme(merged.theme)
  },

  update: async (key, value) => {
    set({ [key]: value } as Partial<SettingsStore>)
    const state = get()
    const settings: AppSettings = {
      theme: state.theme,
      alwaysOnTop: state.alwaysOnTop,
      sidebarCollapsed: state.sidebarCollapsed,
      notesDrawerOpen: state.notesDrawerOpen,
      defaultIndentSize: state.defaultIndentSize,
      defaultTimezone: state.defaultTimezone,
      editorFontSize: state.editorFontSize,
      editorKeybindingMode: state.editorKeybindingMode,
      historyRetentionPerTool: state.historyRetentionPerTool,
      formatOnPaste: state.formatOnPaste,
    }
    await setSetting('appSettings', settings)
    if (key === 'theme') {
      applyTheme(value as AppSettings['theme'])
    }
  },

  toggleTheme: async () => {
    const current = get().theme
    const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'
    await get().update('theme', next)
  },
}))
```

- [ ] **Step 3: Create UI store**

Create `apps/cockpit/src/stores/ui.store.ts`:
```ts
import { create } from 'zustand'

type LastAction = {
  message: string
  type: 'success' | 'error' | 'info'
  timestamp: number
}

type UiStore = {
  activeTool: string
  commandPaletteOpen: boolean
  lastAction: LastAction | null

  setActiveTool: (toolId: string) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setLastAction: (message: string, type?: LastAction['type']) => void
}

export const useUiStore = create<UiStore>()((set) => ({
  activeTool: 'uuid-generator',
  commandPaletteOpen: false,
  lastAction: null,

  setActiveTool: (toolId) => set({ activeTool: toolId }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setLastAction: (message, type = 'info') =>
    set({ lastAction: { message, type, timestamp: Date.now() } }),
}))
```

- [ ] **Step 4: Create tool state persistence hook**

Create `apps/cockpit/src/hooks/useToolState.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadToolState, saveToolState } from '@/lib/db'

/**
 * Persists tool-specific state to SQLite.
 * State survives tool switches (in-memory) and app restarts (SQLite).
 * Debounces writes to SQLite by 2 seconds.
 */
export function useToolState<T extends Record<string, unknown>>(
  toolId: string,
  defaultState: T
): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(defaultState)
  const stateRef = useRef(state)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)

  // Load from SQLite on mount
  useEffect(() => {
    let cancelled = false
    loadToolState(toolId).then((saved) => {
      if (cancelled) return
      if (saved) {
        const merged = { ...defaultState, ...saved } as T
        setState(merged)
        stateRef.current = merged
      }
      loadedRef.current = true
    })
    return () => { cancelled = true }
  // Intentionally exclude `defaultState` from deps — it's only needed for the initial
  // merge on mount. Including it would cause re-fetches on every render since callers
  // pass inline object literals.
  }, [toolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save to SQLite
  const update = useCallback(
    (patch: Partial<T>) => {
      setState((prev) => {
        const next = { ...prev, ...patch }
        stateRef.current = next
        return next
      })

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        saveToolState(toolId, stateRef.current)
      }, 2000)
    },
    [toolId]
  )

  // Save immediately on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (loadedRef.current) {
        saveToolState(toolId, stateRef.current)
      }
    }
  }, [toolId])

  return [state, update]
}
```

- [ ] **Step 5: Create tool-state store for cross-tool state tracking**

Create `apps/cockpit/src/stores/tool-state.store.ts`:
```ts
import { create } from 'zustand'

/**
 * In-memory cache of tool states. Prevents re-loading from SQLite
 * when switching between tools within a session.
 */
type ToolStateCache = {
  cache: Map<string, Record<string, unknown>>
  set: (toolId: string, state: Record<string, unknown>) => void
  get: (toolId: string) => Record<string, unknown> | undefined
}

export const useToolStateCache = create<ToolStateCache>()((set, get) => ({
  cache: new Map(),
  set: (toolId, state) =>
    set((s) => {
      const next = new Map(s.cache)
      next.set(toolId, state)
      return { cache: next }
    }),
  get: (toolId) => get().cache.get(toolId),
}))
```

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/stores/ apps/cockpit/src/hooks/useToolState.ts
git commit -m "feat(cockpit): add Zustand stores for settings, UI, and tool state persistence"
```

---

## Task 5: Tool Registry

**Files:**
- Create: `apps/cockpit/src/types/tools.ts`
- Create: `apps/cockpit/src/app/tool-registry.ts`

**Context:** The tool registry is the single source of truth for all tools. It defines metadata (id, name, group, icon, shortcut) and lazy-loaded React components. Sidebar and command palette both read from this registry. Tools that don't exist yet get a placeholder component.

- [ ] **Step 1: Create tool types**

Create `apps/cockpit/src/types/tools.ts`:
```ts
import type { LazyExoticComponent, ComponentType } from 'react'

export type ToolGroup = 'code' | 'data' | 'web' | 'convert' | 'test' | 'network' | 'write'

export type ToolDefinition = {
  id: string
  name: string
  group: ToolGroup
  icon: string         // Emoji or icon identifier (replaced with proper icons later)
  description: string  // For command palette search
  component: LazyExoticComponent<ComponentType>
}

export type ToolGroupMeta = {
  id: ToolGroup
  label: string
  icon: string
}

export const TOOL_GROUPS: ToolGroupMeta[] = [
  { id: 'code', label: 'Code', icon: '</>' },
  { id: 'data', label: 'Data', icon: '{}' },
  { id: 'web', label: 'Web', icon: '◈' },
  { id: 'convert', label: 'Convert', icon: '⇄' },
  { id: 'test', label: 'Test', icon: '✓' },
  { id: 'network', label: 'Network', icon: '↗' },
  { id: 'write', label: 'Write', icon: '✎' },
]
```

- [ ] **Step 2: Create tool registry with all 28 tools**

Create `apps/cockpit/src/app/tool-registry.ts`:
```ts
import { lazy } from 'react'
import type { ToolDefinition } from '@/types/tools'

// Placeholder for tools not yet implemented
const Placeholder = lazy(() => import('@/tools/placeholder/Placeholder'))

// Implemented tools
const UuidGenerator = lazy(() => import('@/tools/uuid-generator/UuidGenerator'))

export const TOOLS: ToolDefinition[] = [
  // --- Code ---
  { id: 'code-formatter', name: 'Code Formatter', group: 'code', icon: '⌨', description: 'Format and beautify code (JS, TS, CSS, HTML, SQL, Python)', component: Placeholder },
  { id: 'ts-playground', name: 'TypeScript Playground', group: 'code', icon: 'TS', description: 'Transpile TypeScript to JavaScript', component: Placeholder },
  { id: 'diff-viewer', name: 'Diff Viewer', group: 'code', icon: '±', description: 'Compare text side-by-side or inline', component: Placeholder },
  { id: 'refactoring-toolkit', name: 'Refactoring Toolkit', group: 'code', icon: '♻', description: 'AST-based code transforms (var to let, then to await)', component: Placeholder },

  // --- Data ---
  { id: 'json-tools', name: 'JSON Tools', group: 'data', icon: '{}', description: 'Validate, format, tree view, and table view for JSON', component: Placeholder },
  { id: 'xml-tools', name: 'XML Tools', group: 'data', icon: '<>', description: 'Validate and format XML', component: Placeholder },
  { id: 'json-schema-validator', name: 'JSON Schema Validator', group: 'data', icon: '✓{', description: 'Validate JSON against a schema', component: Placeholder },

  // --- Web ---
  { id: 'css-validator', name: 'CSS Validator', group: 'web', icon: '#', description: 'Validate CSS syntax', component: Placeholder },
  { id: 'html-validator', name: 'HTML Validator', group: 'web', icon: '<h>', description: 'Validate HTML structure and accessibility', component: Placeholder },
  { id: 'css-specificity', name: 'CSS Specificity', group: 'web', icon: '!#', description: 'Calculate CSS selector specificity', component: Placeholder },
  { id: 'css-to-tailwind', name: 'CSS → Tailwind', group: 'web', icon: '→T', description: 'Convert CSS rules to Tailwind classes', component: Placeholder },

  // --- Convert ---
  { id: 'case-converter', name: 'Case Converter', group: 'convert', icon: 'Aa', description: 'Convert text between cases (camel, snake, kebab, etc)', component: Placeholder },
  { id: 'color-converter', name: 'Color Converter', group: 'convert', icon: '🎨', description: 'Convert between hex, rgb, hsl, oklch', component: Placeholder },
  { id: 'timestamp-converter', name: 'Timestamp Converter', group: 'convert', icon: '⏱', description: 'Convert between Unix timestamps and human dates', component: Placeholder },
  { id: 'base64', name: 'Base64', group: 'convert', icon: 'B64', description: 'Encode and decode Base64', component: Placeholder },
  { id: 'url-codec', name: 'URL Encode/Decode', group: 'convert', icon: '%', description: 'URL encode and decode strings', component: Placeholder },
  { id: 'curl-to-fetch', name: 'cURL → Fetch', group: 'convert', icon: '→f', description: 'Convert cURL commands to fetch/axios', component: Placeholder },
  { id: 'uuid-generator', name: 'UUID Generator', group: 'convert', icon: '#!', description: 'Generate and validate UUIDs', component: UuidGenerator },
  { id: 'hash-generator', name: 'Hash Generator', group: 'convert', icon: '##', description: 'Generate MD5, SHA-1, SHA-256, SHA-512 hashes', component: Placeholder },

  // --- Test ---
  { id: 'regex-tester', name: 'Regex Tester', group: 'test', icon: '.*', description: 'Test regular expressions with match highlighting', component: Placeholder },
  { id: 'jwt-decoder', name: 'JWT Decoder', group: 'test', icon: 'JWT', description: 'Decode and inspect JWT tokens', component: Placeholder },

  // --- Network ---
  { id: 'api-client', name: 'API Client', group: 'network', icon: '↗', description: 'Send HTTP requests and view responses', component: Placeholder },
  { id: 'docs-browser', name: 'Docs Browser', group: 'network', icon: '📖', description: 'Browse devdocs.io documentation', component: Placeholder },

  // --- Write ---
  { id: 'markdown-editor', name: 'Markdown Editor', group: 'write', icon: 'MD', description: 'Edit and preview markdown with Mermaid support', component: Placeholder },
  { id: 'mermaid-editor', name: 'Mermaid Editor', group: 'write', icon: '◇', description: 'Edit and preview Mermaid diagrams', component: Placeholder },
  { id: 'snippets', name: 'Snippets', group: 'write', icon: '✂', description: 'Manage code snippets with tags and search', component: Placeholder },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id)
}

export function getToolsByGroup(group: string): ToolDefinition[] {
  return TOOLS.filter((t) => t.group === group)
}
```

- [ ] **Step 3: Create placeholder component**

Create `apps/cockpit/src/tools/placeholder/Placeholder.tsx`:
```tsx
export default function Placeholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="font-pixel text-xl text-[var(--color-text-muted)]">Coming Soon</div>
      <div className="text-sm text-[var(--color-text-muted)]">This tool is not yet implemented.</div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/cockpit/src/types/tools.ts apps/cockpit/src/app/tool-registry.ts apps/cockpit/src/tools/placeholder/
git commit -m "feat(cockpit): add tool registry with 28 tools and group metadata"
```

---

## Task 6: Shell UI — Sidebar

**Files:**
- Create: `apps/cockpit/src/components/shell/Sidebar.tsx`
- Create: `apps/cockpit/src/components/shell/SidebarGroup.tsx`
- Create: `apps/cockpit/src/components/shell/SidebarItem.tsx`

- [ ] **Step 1: Create SidebarItem component**

Create `apps/cockpit/src/components/shell/SidebarItem.tsx`:
```tsx
import { useUiStore } from '@/stores/ui.store'

type SidebarItemProps = {
  id: string
  name: string
  icon: string
}

export function SidebarItem({ id, name, icon }: SidebarItemProps) {
  const activeTool = useUiStore((s) => s.activeTool)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const isActive = activeTool === id

  return (
    <button
      onClick={() => setActiveTool(id)}
      title={name}
      className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-xs transition-colors ${
        isActive
          ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
      }`}
    >
      <span className="w-5 shrink-0 text-center font-pixel text-[10px]">{icon}</span>
      <span className="truncate">{name}</span>
    </button>
  )
}
```

- [ ] **Step 2: Create SidebarGroup component**

Create `apps/cockpit/src/components/shell/SidebarGroup.tsx`:
```tsx
import { useState } from 'react'
import type { ToolDefinition, ToolGroupMeta } from '@/types/tools'
import { SidebarItem } from './SidebarItem'

type SidebarGroupProps = {
  group: ToolGroupMeta
  tools: ToolDefinition[]
}

export function SidebarGroup({ group, tools }: SidebarGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <span className={`text-[8px] transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
        <span className="font-pixel">{group.label}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-1">
          {tools.map((tool) => (
            <SidebarItem key={tool.id} id={tool.id} name={tool.name} icon={tool.icon} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create Sidebar component**

Create `apps/cockpit/src/components/shell/Sidebar.tsx`:
```tsx
import { TOOL_GROUPS } from '@/types/tools'
import { TOOLS } from '@/app/tool-registry'
import { useSettingsStore } from '@/stores/settings.store'
import { SidebarGroup } from './SidebarGroup'

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)

  if (sidebarCollapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2">
        {TOOL_GROUPS.map((group) => (
          <div
            key={group.id}
            className="mb-2 flex h-7 w-7 items-center justify-center font-pixel text-[10px] text-[var(--color-text-muted)]"
            title={group.label}
          >
            {group.icon}
          </div>
        ))}
      </aside>
    )
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2">
      <div className="mb-3 px-3">
        <h1 className="font-pixel text-sm text-[var(--color-accent)]">devdrivr</h1>
      </div>
      {TOOL_GROUPS.map((group) => {
        const tools = TOOLS.filter((t) => t.group === group.id)
        return <SidebarGroup key={group.id} group={group} tools={tools} />
      })}
    </aside>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/cockpit/src/components/shell/
git commit -m "feat(cockpit): add sidebar with grouped tool navigation"
```

---

## Task 7: Shell UI — Workspace, Status Bar, Notes Drawer, App Shell

**Files:**
- Create: `apps/cockpit/src/components/shell/Workspace.tsx`
- Create: `apps/cockpit/src/components/shell/StatusBar.tsx`
- Create: `apps/cockpit/src/components/shell/NotesDrawer.tsx`
- Create: `apps/cockpit/src/components/shared/ErrorBoundary.tsx`
- Create: `apps/cockpit/src/app/App.tsx`
- Create: `apps/cockpit/src/app/providers.tsx`
- Modify: `apps/cockpit/src/main.tsx`

- [ ] **Step 1: Create ErrorBoundary**

Create `apps/cockpit/src/components/shared/ErrorBoundary.tsx`:
```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; fallbackMessage?: string }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <div className="font-pixel text-lg text-[var(--color-error)]">Something broke</div>
          <pre className="max-w-lg overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-text-muted)]">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Create Workspace**

Create `apps/cockpit/src/components/shell/Workspace.tsx`:
```tsx
import { Suspense } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { getToolById } from '@/app/tool-registry'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

export function Workspace() {
  const activeTool = useUiStore((s) => s.activeTool)
  const tool = getToolById(activeTool)

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
        No tool selected
      </div>
    )
  }

  const ToolComponent = tool.component

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tool header */}
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <span className="font-pixel text-xs text-[var(--color-accent)]">{tool.name}</span>
      </div>

      {/* Tool content */}
      <div className="flex-1 overflow-auto">
        <ErrorBoundary key={activeTool}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
                Loading...
              </div>
            }
          >
            <ToolComponent />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create StatusBar**

Create `apps/cockpit/src/components/shell/StatusBar.tsx`:
```tsx
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getToolById } from '@/app/tool-registry'

export function StatusBar() {
  const activeTool = useUiStore((s) => s.activeTool)
  const lastAction = useUiStore((s) => s.lastAction)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const theme = useSettingsStore((s) => s.theme)
  const tool = getToolById(activeTool)

  const actionColor =
    lastAction?.type === 'error'
      ? 'text-[var(--color-error)]'
      : lastAction?.type === 'success'
        ? 'text-[var(--color-success)]'
        : 'text-[var(--color-text-muted)]'

  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px]">
      <div className="flex items-center gap-3">
        <span className="text-[var(--color-text-muted)]">{tool?.name ?? ''}</span>
        {lastAction && (
          <span className={actionColor}>{lastAction.message}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚙️'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create NotesDrawer stub**

Create `apps/cockpit/src/components/shell/NotesDrawer.tsx`:
```tsx
import { useSettingsStore } from '@/stores/settings.store'

export function NotesDrawer() {
  const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen)

  if (!drawerOpen) return null

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 items-center border-b border-[var(--color-border)] px-3">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Notes</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 text-xs text-[var(--color-text-muted)]">
        Notes will appear here (Plan 4)
      </div>
    </aside>
  )
}
```

- [ ] **Step 5: Create providers wrapper**

Create `apps/cockpit/src/app/providers.tsx`:
```tsx
import { type ReactNode, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings.store'

export function Providers({ children }: { children: ReactNode }) {
  const init = useSettingsStore((s) => s.init)
  const initialized = useSettingsStore((s) => s.initialized)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    init().catch((err) => {
      console.error('Failed to initialize settings:', err)
      setError(String(err))
    })
  }, [init])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-[var(--color-error)]">Failed to initialize: {error}</div>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="font-pixel text-sm text-[var(--color-accent)]">Loading...</div>
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 6: Create App shell**

Create `apps/cockpit/src/app/App.tsx`:
```tsx
import { Sidebar } from '@/components/shell/Sidebar'
import { Workspace } from '@/components/shell/Workspace'
import { NotesDrawer } from '@/components/shell/NotesDrawer'
import { StatusBar } from '@/components/shell/StatusBar'

export function App() {
  return (
    <div className="flex h-full flex-col">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Workspace />
        </main>
        <NotesDrawer />
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
```

- [ ] **Step 7: Update main.tsx**

Update `apps/cockpit/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from '@/app/App'
import { Providers } from '@/app/providers'
import { applyTheme } from '@/lib/theme'

applyTheme('system')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>
)
```

- [ ] **Step 8: Verify shell renders correctly**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```
Expected: Window opens with sidebar on left showing all 7 tool groups with tools listed. Center workspace shows the UUID Generator placeholder. Status bar at bottom shows tool name and theme toggle.

- [ ] **Step 9: Commit**

```bash
git add apps/cockpit/src/
git commit -m "feat(cockpit): add shell layout — sidebar, workspace, status bar, notes drawer"
```

---

## Task 8: Keyboard Shortcuts

**Files:**
- Create: `apps/cockpit/src/lib/keybindings.ts`
- Create: `apps/cockpit/src/hooks/useKeyboardShortcut.ts`
- Create: `apps/cockpit/src/hooks/useGlobalShortcuts.ts`
- Modify: `apps/cockpit/src/app/App.tsx` (add global shortcuts)

- [ ] **Step 1: Create keybindings registry**

Create `apps/cockpit/src/lib/keybindings.ts`:
```ts
import { detectPlatform } from '@/lib/platform'

export type KeyCombo = {
  key: string
  mod?: boolean    // Cmd/Ctrl
  shift?: boolean
  alt?: boolean
}

/**
 * Checks if a keyboard event matches a key combo.
 * `mod` maps to Meta on macOS, Control on Windows/Linux.
 */
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const platform = detectPlatform()
  const modKey = platform === 'mac' ? event.metaKey : event.ctrlKey

  if (combo.mod && !modKey) return false
  if (!combo.mod && modKey) return false
  if (combo.shift && !event.shiftKey) return false
  if (!combo.shift && event.shiftKey) return false
  if (combo.alt && !event.altKey) return false

  return event.key.toLowerCase() === combo.key.toLowerCase()
}

export function formatCombo(combo: KeyCombo, modSymbol: string): string {
  const parts: string[] = []
  if (combo.mod) parts.push(modSymbol)
  if (combo.shift) parts.push('Shift')
  if (combo.alt) parts.push('Alt')
  parts.push(combo.key.toUpperCase())
  return parts.join('+')
}
```

- [ ] **Step 2: Create keyboard shortcut hook**

Create `apps/cockpit/src/hooks/useKeyboardShortcut.ts`:
```ts
import { useEffect, useRef } from 'react'
import { matchesCombo, type KeyCombo } from '@/lib/keybindings'

export function useKeyboardShortcut(combo: KeyCombo, handler: () => void): void {
  // Use refs to avoid re-registering the listener when combo/handler change
  const comboRef = useRef(combo)
  const handlerRef = useRef(handler)
  comboRef.current = combo
  handlerRef.current = handler

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Skip shortcuts when focus is in an editable field (Monaco, input, textarea)
      // Exception: shortcuts with mod key still fire (e.g., Cmd+K in a text field)
      const target = event.target as HTMLElement
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true' ||
        target.closest('.monaco-editor') !== null

      // Only skip non-mod shortcuts in editable fields
      if (isEditable && !comboRef.current.mod) return

      if (matchesCombo(event, comboRef.current)) {
        event.preventDefault()
        handlerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // Stable — uses refs
}
```

- [ ] **Step 3: Create global shortcuts hook**

Create `apps/cockpit/src/hooks/useGlobalShortcuts.ts`:
```ts
import { useCallback, useMemo } from 'react'
import { useKeyboardShortcut } from './useKeyboardShortcut'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { TOOLS } from '@/app/tool-registry'

/**
 * Registers all global keyboard shortcuts.
 * Uses useMemo to stabilize KeyCombo objects and useCallback for all handlers
 * to prevent useEffect re-registrations on every render.
 */
export function useGlobalShortcuts(): void {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const activeTool = useUiStore((s) => s.activeTool)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const update = useSettingsStore((s) => s.update)
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const notesDrawerOpen = useSettingsStore((s) => s.notesDrawerOpen)

  // Stabilize combo objects so useEffect deps don't churn
  const comboK = useMemo(() => ({ key: 'k', mod: true } as const), [])
  const comboB = useMemo(() => ({ key: 'b', mod: true } as const), [])
  const comboShiftN = useMemo(() => ({ key: 'n', mod: true, shift: true } as const), [])
  const comboShiftT = useMemo(() => ({ key: 't', mod: true, shift: true } as const), [])
  const comboNext = useMemo(() => ({ key: ']', mod: true } as const), [])
  const comboPrev = useMemo(() => ({ key: '[', mod: true } as const), [])

  const toggleSidebar = useCallback(
    () => update('sidebarCollapsed', !sidebarCollapsed),
    [update, sidebarCollapsed]
  )

  const toggleDrawer = useCallback(
    () => update('notesDrawerOpen', !notesDrawerOpen),
    [update, notesDrawerOpen]
  )

  const nextTool = useCallback(() => {
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const next = TOOLS[(idx + 1) % TOOLS.length]
    if (next) setActiveTool(next.id)
  }, [activeTool, setActiveTool])

  const prevTool = useCallback(() => {
    const idx = TOOLS.findIndex((t) => t.id === activeTool)
    const prev = TOOLS[(idx - 1 + TOOLS.length) % TOOLS.length]
    if (prev) setActiveTool(prev.id)
  }, [activeTool, setActiveTool])

  useKeyboardShortcut(comboK, toggleCommandPalette)
  useKeyboardShortcut(comboB, toggleSidebar)
  useKeyboardShortcut(comboShiftN, toggleDrawer)
  useKeyboardShortcut(comboShiftT, toggleTheme)
  useKeyboardShortcut(comboNext, nextTool)
  useKeyboardShortcut(comboPrev, prevTool)
}
```

- [ ] **Step 4: Wire global shortcuts into App**

Update `apps/cockpit/src/app/App.tsx` — add `useGlobalShortcuts()` call inside the `App` component body (before the return).

```tsx
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'

export function App() {
  useGlobalShortcuts()

  return (
    // ... existing JSX
  )
}
```

- [ ] **Step 5: Verify shortcuts work**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```

Test:
- Cmd/Ctrl+B toggles sidebar collapsed/expanded
- Cmd/Ctrl+Shift+N toggles notes drawer
- Cmd/Ctrl+Shift+T cycles theme (dark → light → system)
- Cmd/Ctrl+] / Cmd/Ctrl+[ cycles through tools
- Cmd/Ctrl+K should do nothing yet (command palette not built yet)

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/
git commit -m "feat(cockpit): add keyboard shortcuts — sidebar, drawer, theme, tool cycling"
```

---

## Task 9: Command Palette

**Files:**
- Create: `apps/cockpit/src/components/shell/CommandPalette.tsx`
- Modify: `apps/cockpit/src/app/App.tsx` (render CommandPalette)

**Context:** Install `fuse.js` for fuzzy search. The command palette is a floating overlay triggered by Cmd/Ctrl+K. It searches tool names and descriptions. Selecting a tool switches to it and closes the palette. Esc closes it.

- [ ] **Step 1: Install fuse.js**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add fuse.js
```

- [ ] **Step 2: Create CommandPalette component**

Create `apps/cockpit/src/components/shell/CommandPalette.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { TOOLS } from '@/app/tool-registry'
import { useUiStore } from '@/stores/ui.store'
import { usePlatform } from '@/hooks/usePlatform'

export function CommandPalette() {
  const isOpen = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setActiveTool = useUiStore((s) => s.setActiveTool)
  const { modSymbol } = usePlatform()

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const fuse = useMemo(
    () =>
      new Fuse(TOOLS, {
        keys: ['name', 'description'],
        threshold: 0.4,
        includeScore: true,
      }),
    []
  )

  const results = useMemo(() => {
    if (!query.trim()) return TOOLS
    return fuse.search(query).map((r) => r.item)
  }, [query, fuse])

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      // Focus input after render
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter': {
          e.preventDefault()
          const selected = results[selectedIndex]
          if (selected) {
            setActiveTool(selected.id)
            setOpen(false)
          }
          break
        }
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
      }
    },
    [results, selectedIndex, setActiveTool, setOpen]
  )

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="fixed left-1/2 top-[15%] z-50 w-[500px] -translate-x-1/2 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* Search input */}
        <div className="flex items-center border-b border-[var(--color-border)] px-3">
          <span className="mr-2 text-sm text-[var(--color-text-muted)]">&gt;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={`Search tools... (${modSymbol}+K)`}
            className="h-11 flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {results.map((tool, i) => (
            <button
              key={tool.id}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                i === selectedIndex
                  ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
              }`}
              onClick={() => {
                setActiveTool(tool.id)
                setOpen(false)
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="w-6 shrink-0 text-center font-pixel text-[10px]">{tool.icon}</span>
              <div className="flex-1">
                <div className="font-medium">{tool.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{tool.description}</div>
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
              No tools found
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add CommandPalette to App**

Update `apps/cockpit/src/app/App.tsx` — add `<CommandPalette />` as the last child inside the outer `<div>`:

```tsx
import { CommandPalette } from '@/components/shell/CommandPalette'

// Inside App return, after <StatusBar />:
<CommandPalette />
```

- [ ] **Step 4: Verify command palette**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```

Test:
- Cmd/Ctrl+K opens the palette with backdrop
- Type "json" — results filter to JSON-related tools
- Arrow keys navigate, Enter selects, Esc closes
- Clicking a result switches tools and closes palette
- Clicking backdrop closes palette

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/
git commit -m "feat(cockpit): add command palette with fuzzy search"
```

---

## Task 10: UUID Generator — Proof-of-Concept Tool

**Files:**
- Create: `apps/cockpit/src/tools/uuid-generator/UuidGenerator.tsx`
- Create: `apps/cockpit/src/components/shared/CopyButton.tsx`

**Context:** This is the simplest tool — proves the architecture works end-to-end: tool renders in workspace, state persists, copy feedback shows in status bar. Uses `crypto.randomUUID()` (available in all modern browsers and Tauri).

- [ ] **Step 1: Install nanoid for note/snippet IDs (used later too)**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add nanoid
```

- [ ] **Step 2: Create CopyButton shared component**

Create `apps/cockpit/src/components/shared/CopyButton.tsx`:
```tsx
import { useState } from 'react'
import { useUiStore } from '@/stores/ui.store'

type CopyButtonProps = {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const setLastAction = useUiStore((s) => s.setLastAction)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setLastAction('Copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className={`rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] ${className}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
```

- [ ] **Step 3: Create UUID Generator tool**

Create `apps/cockpit/src/tools/uuid-generator/UuidGenerator.tsx`:
```tsx
import { useCallback, useState } from 'react'
import { CopyButton } from '@/components/shared/CopyButton'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function generateUuid(): string {
  return crypto.randomUUID()
}

type UuidState = {
  lastGenerated: string
  bulkCount: number
  validateInput: string
}

export default function UuidGenerator() {
  const [state, updateState] = useToolState<UuidState>('uuid-generator', {
    lastGenerated: '',
    bulkCount: 10,
    validateInput: '',
  })

  const [bulkUuids, setBulkUuids] = useState<string[]>([])
  const setLastAction = useUiStore((s) => s.setLastAction)

  const generate = useCallback(() => {
    const uuid = generateUuid()
    updateState({ lastGenerated: uuid })
    setLastAction('Generated UUID', 'success')
  }, [updateState, setLastAction])

  const generateBulk = useCallback(() => {
    const count = Math.min(Math.max(1, state.bulkCount), 100)
    const uuids = Array.from({ length: count }, () => generateUuid())
    setBulkUuids(uuids)
    setLastAction(`Generated ${count} UUIDs`, 'success')
  }, [state.bulkCount, setLastAction])

  const validateResult = (state.validateInput).trim()
    ? UUID_V4_REGEX.test((state.validateInput).trim())
      ? { valid: true, message: '✓ Valid UUID v4' }
      : { valid: false, message: '✗ Not a valid UUID v4' }
    : null

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Single generation */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Generate</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={generate}
            className="rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Generate UUID
          </button>
          {(state.lastGenerated) && (
            <div className="flex items-center gap-2">
              <code className="rounded bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
                {state.lastGenerated}
              </code>
              <CopyButton text={state.lastGenerated} />
            </div>
          )}
        </div>
      </section>

      {/* Bulk generation */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Bulk Generate</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={100}
            value={state.bulkCount}
            onChange={(e) => updateState({ bulkCount: parseInt(e.target.value) || 1 })}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={generateBulk}
            className="rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Generate
          </button>
          {bulkUuids.length > 0 && (
            <CopyButton text={bulkUuids.join('\n')} label="Copy All" />
          )}
        </div>
        {bulkUuids.length > 0 && (
          <pre className="max-h-60 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]">
            {bulkUuids.join('\n')}
          </pre>
        )}
      </section>

      {/* Validation */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Validate</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={state.validateInput}
            onChange={(e) => updateState({ validateInput: e.target.value })}
            placeholder="Paste a UUID to validate..."
            className="w-96 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          {validateResult && (
            <span
              className={`text-sm ${
                validateResult.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
              }`}
            >
              {validateResult.message}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Verify UUID Generator works end-to-end**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run tauri dev
```

Test:
- UUID Generator shows in sidebar under Convert group
- Click "Generate UUID" — UUID appears, status bar shows "Generated UUID"
- Click Copy — status bar shows "Copied to clipboard"
- Bulk generate with count 5 — 5 UUIDs appear
- Paste a UUID into validate — shows valid/invalid
- Switch to another tool via sidebar, switch back — UUID Generator state preserved
- Close app, reopen — last generated UUID and bulk count still there

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/
git commit -m "feat(cockpit): add UUID Generator tool as proof-of-concept"
```

---

## Task 11: Shared TabBar Component

**Files:**
- Create: `apps/cockpit/src/components/shared/TabBar.tsx`

**Context:** Many tools have sub-tabs (JSON Tools has Lint/Tree/Table, Diff Viewer has side-by-side/inline, etc.). Build the shared tab bar now for Plan 2-4 tools to use.

**Important:** TabBar registers Cmd/Ctrl+1/2/3 shortcuts globally via window keydown. These only fire when TabBar is mounted (i.e., the active tool renders it). Since Workspace only renders one tool at a time, this is safe. However, the shortcuts will fire even when focus is in Monaco or an input field. The useKeyboardShortcut hook should skip events where `event.target` is an input/textarea/[contenteditable] — this filtering is added below.

- [ ] **Step 1: Create TabBar component**

Create `apps/cockpit/src/components/shared/TabBar.tsx`:
```tsx
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useCallback } from 'react'

type Tab = {
  id: string
  label: string
}

type TabBarProps = {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  // Cmd/Ctrl+1..9 for tab switching
  const switchTab = useCallback(
    (index: number) => {
      const tab = tabs[index]
      if (tab) onTabChange(tab.id)
    },
    [tabs, onTabChange]
  )

  useKeyboardShortcut({ key: '1', mod: true }, () => switchTab(0))
  useKeyboardShortcut({ key: '2', mod: true }, () => switchTab(1))
  useKeyboardShortcut({ key: '3', mod: true }, () => switchTab(2))

  return (
    <div className="flex border-b border-[var(--color-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-xs ${
            activeTab === tab.id
              ? 'border-b-2 border-[var(--color-accent)] font-bold text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cockpit/src/components/shared/TabBar.tsx
git commit -m "feat(cockpit): add shared TabBar component for tool sub-modes"
```

---

## Task 12: Vitest Setup + First Tests

**Files:**
- Create: `apps/cockpit/vitest.config.ts`
- Create: `apps/cockpit/src/lib/__tests__/theme.test.ts`
- Create: `apps/cockpit/src/lib/__tests__/keybindings.test.ts`
- Create: `apps/cockpit/src/lib/__tests__/platform.test.ts`
- Modify: `apps/cockpit/package.json` (add test scripts)

**Context:** Vitest for unit tests. We test pure utility functions first (theme, keybindings, platform detection). These don't need DOM or Tauri — they're pure logic.

- [ ] **Step 1: Install Vitest**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest config**

Create `apps/cockpit/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Add test scripts to package.json**

Add to `apps/cockpit/package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write platform detection tests**

Create `apps/cockpit/src/lib/__tests__/platform.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { detectPlatform, getModKey, getModKeySymbol } from '../platform'

describe('detectPlatform', () => {
  it('returns mac for macOS user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })
    expect(detectPlatform()).toBe('mac')
    vi.unstubAllGlobals()
  })

  it('returns windows for Windows user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
    expect(detectPlatform()).toBe('windows')
    vi.unstubAllGlobals()
  })

  it('returns linux for Linux user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(detectPlatform()).toBe('linux')
    vi.unstubAllGlobals()
  })
})

describe('getModKey', () => {
  it('returns Cmd for mac', () => {
    expect(getModKey('mac')).toBe('Cmd')
  })

  it('returns Ctrl for windows', () => {
    expect(getModKey('windows')).toBe('Ctrl')
  })
})

describe('getModKeySymbol', () => {
  it('returns ⌘ for mac', () => {
    expect(getModKeySymbol('mac')).toBe('⌘')
  })

  it('returns Ctrl for windows', () => {
    expect(getModKeySymbol('windows')).toBe('Ctrl')
  })
})
```

- [ ] **Step 5: Write theme utility tests**

Create `apps/cockpit/src/lib/__tests__/theme.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { getEffectiveTheme } from '../theme'

describe('getEffectiveTheme', () => {
  it('returns dark when theme is dark', () => {
    expect(getEffectiveTheme('dark')).toBe('dark')
  })

  it('returns light when theme is light', () => {
    expect(getEffectiveTheme('light')).toBe('light')
  })

  it('returns dark when theme is system and prefers dark', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    })
    expect(getEffectiveTheme('system')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('returns light when theme is system and prefers light', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    })
    expect(getEffectiveTheme('system')).toBe('light')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 6: Write keybindings tests**

Create `apps/cockpit/src/lib/__tests__/keybindings.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { matchesCombo, formatCombo } from '../keybindings'

// Mock platform as mac for consistent tests
vi.mock('../platform', () => ({
  detectPlatform: () => 'mac' as const,
}))

describe('matchesCombo', () => {
  function makeEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: '',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent
  }

  it('matches simple mod+key combo on mac', () => {
    const event = makeEvent({ key: 'k', metaKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(true)
  })

  it('rejects when mod not pressed', () => {
    const event = makeEvent({ key: 'k', metaKey: false })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })

  it('matches mod+shift+key', () => {
    const event = makeEvent({ key: 'n', metaKey: true, shiftKey: true })
    expect(matchesCombo(event, { key: 'n', mod: true, shift: true })).toBe(true)
  })

  it('rejects extra modifiers', () => {
    const event = makeEvent({ key: 'k', metaKey: true, shiftKey: true })
    expect(matchesCombo(event, { key: 'k', mod: true })).toBe(false)
  })
})

describe('formatCombo', () => {
  it('formats mod+key', () => {
    expect(formatCombo({ key: 'k', mod: true }, '⌘')).toBe('⌘+K')
  })

  it('formats mod+shift+key', () => {
    expect(formatCombo({ key: 'n', mod: true, shift: true }, '⌘')).toBe('⌘+Shift+N')
  })
})
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run test
```
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/cockpit/
git commit -m "feat(cockpit): add Vitest setup with platform, theme, and keybinding tests"
```

---

## Task 13: Final Integration Verification

- [ ] **Step 1: Full smoke test**

```bash
cd /Users/tuxgeek/Dev/devdrivr/apps/cockpit
bun run test && bun run tauri dev
```

Verify all of the following work together:
1. App launches with dark theme, sidebar shows all 7 groups with tools
2. Cmd/Ctrl+K opens command palette — search "uuid", select it, palette closes
3. UUID Generator works: generate, bulk generate, validate, copy
4. Cmd/Ctrl+B collapses sidebar to icon-only rail
5. Cmd/Ctrl+Shift+N opens notes drawer (stub)
6. Cmd/Ctrl+Shift+T toggles theme (dark → light → system)
7. Cmd/Ctrl+] / Cmd/Ctrl+[ cycles through tools
8. Status bar shows current tool name and last action
9. Close app, reopen — UUID Generator state restored, theme preference preserved
10. Switch tools — each tool's state preserved in memory

- [ ] **Step 2: Commit if any fixes were needed**

```bash
git add apps/cockpit/
git commit -m "fix(cockpit): integration fixes from smoke test"
```

---

## Summary

After completing this plan, you have:

- **Tauri 2 desktop app** scaffolded at `apps/cockpit/` with Vite + React + TypeScript (strict)
- **Tailwind CSS 4** with dark/light/system theme, CSS custom properties, retro design tokens
- **SQLite database** with all tables (settings, tool_state, snippets, notes, history), WAL mode, typed JS wrapper
- **Zustand stores** for settings (SQLite-persisted), UI state, and tool state caching
- **Shell UI**: sidebar with 7 collapsible tool groups, workspace with Suspense/ErrorBoundary, notes drawer stub, status bar with theme toggle
- **Command palette** with fuzzy search across 28 registered tools
- **Keyboard shortcuts**: Cmd/Ctrl+K (palette), +B (sidebar), +Shift+N (drawer), +Shift+T (theme), +]/[ (cycle tools)
- **Tool registry** with all 28 tools registered (27 as placeholders, 1 implemented)
- **UUID Generator** as working proof-of-concept with persistent state
- **Shared components**: CopyButton, TabBar, ErrorBoundary
- **Vitest** with tests for platform detection, theme logic, and keybindings
- **useToolState hook** for per-tool persistent state (memory + SQLite with 2s debounce)

**Next plans to write:**
- **Plan 2: Editor-Based Tools** — Monaco Editor setup, JSON Tools, Code Formatter, XML Tools, Diff Viewer, Markdown Editor, Mermaid Editor, TS Playground, Refactoring Toolkit
- **Plan 3: Utility Tools** — Case Converter, Color Converter, Timestamp Converter, Base64, URL Codec, cURL→Fetch, Hash Generator, Regex Tester, JWT Decoder, CSS Validator, HTML Validator, CSS Specificity, CSS→Tailwind
- **Plan 4: System Features** — Notes (sticky system with pop-out windows + global hotkey), Snippets, History, API Client, Docs Browser, cross-tool "Send to" flow, file drag-and-drop
