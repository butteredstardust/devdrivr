# DIRECTORY MAP — devdrivr

> Everything you need to find any file in under 10 seconds.

---

## Top-Level Layout

```
./
├── documentation/          ← You are here
├── src/                    ← All application source
├── src-tauri/               ← Rust/Tauri backend
├── public/                  ← Static assets (favicon, etc.)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
├── CLAUDE.md                ← Claude-specific supplement (points to AGENTS.md)
├── GEMINI.md                ← Gemini-specific supplement (points to AGENTS.md)
└── AGENTS.md                ← Canonical dev guidance — read this first
```

---

## `src/` — Application Source

### `src/app/` — Bootstrap & Registry

| File               | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `App.tsx`          | Root component: `<Sidebar> + <Workspace> + <NotesDrawer>` in a flex row       |
| `providers.tsx`    | **Boot sequence**: window geometry → stores → active tool → listeners         |
| `tool-registry.ts` | **Single source of truth** for all 30 tools (React.lazy, IDs, labels, groups) |
| `tool-groups.tsx`  | Sidebar group metadata: id, label, Phosphor icon per group                    |

### `src/components/shell/` — App Chrome

| File                        | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `Sidebar.tsx`               | Left tool list; collapsible (40px ↔ 208px); group headers                |
| `SidebarGroup.tsx`          | A single expandable group in the sidebar                                 |
| `SidebarItem.tsx`           | One tool link in the sidebar                                             |
| `SidebarCollapsedGroup.tsx` | Group rendering when the sidebar is collapsed to icon rail               |
| `SidebarPinned.tsx`         | Pinned tools section                                                     |
| `SidebarRecent.tsx`         | Recently used tools section                                              |
| `SidebarFooter.tsx`         | Theme toggle + notes + collapse button at sidebar bottom                 |
| `Workspace.tsx`             | Renders active tool via lazy import + Suspense + ErrorBoundary           |
| `WorkspaceTabStrip.tsx`     | Multi-tab strip above the workspace                                      |
| `NotesDrawer.tsx`           | Right panel: sticky notes + history tabs; **resizable** (drag left edge) |
| `CommandPalette.tsx`        | `Cmd+K` fuzzy search over all tools (Fuse.js)                            |
| `SettingsPanel.tsx`         | Slide-in settings: theme, font size, keybindings, history retention      |
| `ShortcutsModal.tsx`        | `Cmd+/` keyboard reference modal                                         |
| `StatusBar.tsx`             | Bottom bar: last action feedback + active tool name                      |
| `UpdateNotification.tsx`    | Update-available banner, wired to `updater.store.ts`                     |

### `src/components/shared/` — Reusable UI

| File                          | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `Button.tsx`                  | Button with `variant` prop (primary, secondary, ghost, danger) |
| `CopyButton.tsx`              | Copy-to-clipboard with success flash                           |
| `TabBar.tsx`                  | Horizontal tab navigation (used in multi-tab tools)            |
| `Toggle.tsx`                  | Animated toggle switch                                         |
| `Toast.tsx`                   | Auto-dismissing notification popup (3s)                        |
| `Alert.tsx`                   | Inline alert banner (info/warning/error variants)              |
| `Dialog.tsx`                  | Modal dialog primitive                                         |
| `Input.tsx`                   | Styled text input                                              |
| `SendToMenu.tsx`              | Context menu for sending content between tools                 |
| `SelectionContextToolbar.tsx` | Floating toolbar on text selection (used with Monaco/DOM)      |
| `ErrorBoundary.tsx`           | Class component fallback for tool crashes                      |
| `Mascot.tsx`                  | App logo / branding                                            |

### `src/hooks/` — Custom Hooks

| File                           | Returns / Purpose                                                  |
| ------------------------------ | ------------------------------------------------------------------ |
| `useWorker.ts`                 | `WorkerRpc<T> \| null` — RPC wrapper for Web Workers (no Comlink)  |
| `useToolState.ts`              | `[state, setState]` — Per-tool SQLite persistence with 2s debounce |
| `useToolAction.ts`             | Subscribe to shell→tool actions (execute, copy, open-file, etc.)   |
| `useToolHistory.ts`            | Read/write per-tool execution history entries                      |
| `useGlobalShortcuts.ts`        | `void` — Registers all global keyboard shortcuts                   |
| `useKeyboardShortcut.ts`       | Register a single `{ key, mod?, shift?, alt? }` shortcut           |
| `useMonaco.ts`                 | Syncs Monaco editor theme with app theme; exports `EDITOR_OPTIONS` |
| `useMonacoSelectionToolbar.ts` | Wires `SelectionContextToolbar` to a Monaco editor instance        |
| `useDomSelectionToolbar.ts`    | Wires `SelectionContextToolbar` to plain DOM text selections       |
| `useRegexEvaluation.ts`        | Debounced regex match evaluation (backed by `regex.worker`)        |
| `usePlatform.ts`               | `{ platform, isMac, modKey, modSymbol }` — OS detection (cached)   |
| `useFileDropZone.ts`           | `{ isDragging }` — Tauri file drop to content handler              |

### `src/lib/` — Core Libraries

| File              | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `db.ts`           | **All SQLite access.** Promise singleton `getDb()`. CRUD for all tables.             |
| `theme.ts`        | `applyTheme(theme)` — Applies CSS class + localStorage cache                         |
| `tool-actions.ts` | Pub/sub for shell↔tool communication (`dispatchToolAction`, `useToolActionListener`) |
| `platform.ts`     | `detectPlatform()` — Cached OS detection                                             |
| `keybindings.ts`  | Combo matching + human-readable formatting (`⌘K`, `Ctrl+K`)                          |
| `file-io.ts`      | `openFile()` / `saveFile()` — Tauri dialog wrappers                                  |
| `api-import.ts`   | Import Postman/Insomnia/OpenAPI collections into API Client                          |
| `schemas.ts`      | Shared Zod/JSON schema definitions used across tools                                 |
| `markdown.ts`     | Markdown parsing/rendering helpers shared by Markdown Editor and Notes               |
| `xml-xpath.ts`    | XPath query evaluation used by XML Tools                                             |
| `editor-themes/`  | Monaco editor theme definitions                                                      |

### `src/stores/` — Zustand Stores

| File                        | What It Holds                                                  | Persistence                                                  |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `settings.store.ts`         | Theme, sidebar, drawer, editor prefs                           | SQLite `settings` → `appSettings` key                        |
| `ui.store.ts`               | Active tool, modals open, toasts, pendingSendTo                | None (transient)                                             |
| `notes.store.ts`            | All sticky notes (color, pinned, bounds, sort order)           | SQLite `notes` table                                         |
| `snippets.store.ts`         | Code snippets with tags and folders                            | SQLite `snippets` table                                      |
| `history.store.ts`          | Tool execution history (input/output)                          | SQLite `history` table                                       |
| `tool-state.store.ts`       | In-memory cache of tool UI states                              | Write-through to SQLite `tool_state`                         |
| `api.store.ts`              | API Client request/response state, environments, collections   | SQLite `api_environments`, `api_collections`, `api_requests` |
| `prompt-templates.store.ts` | Built-in + user-created prompt templates                       | SQLite `user_prompt_templates`                               |
| `mcp.store.ts`              | MCP server connection/session state (see `src-tauri/src/mcp/`) | None (transient)                                             |
| `updater.store.ts`          | App update check/download/install state                        | None (transient)                                             |

### `src/tools/` — The 30 Tools

Each tool lives in `src/tools/<id>/` with one or more component files (multi-tab tools like
CSV Tools split into several components):

```
src/tools/
├── api-client/           ApiClient.tsx
├── base64/               Base64Tool.tsx
├── case-converter/       CaseConverter.tsx
├── code-formatter/       CodeFormatter.tsx        ← uses formatter.worker
├── color-converter/      ColorConverter.tsx
├── css-specificity/      CssSpecificity.tsx
├── css-to-tailwind/      CssToTailwind.tsx
├── css-validator/        CssValidator.tsx
├── csv-tools/            CsvTools.tsx, CsvTable.tsx, CsvConvert.tsx, CsvAnalyze.tsx
├── curl-to-fetch/        CurlToFetch.tsx
├── diff-viewer/          DiffViewer.tsx           ← uses diff.worker
├── docs-browser/         DocsBrowser.tsx
├── hash-generator/       HashGenerator.tsx
├── html-validator/       HtmlValidator.tsx
├── image-tool/           ImageTool.tsx
├── json-schema-validator/ JsonSchemaValidator.tsx
├── json-tools/           JsonTools.tsx            ← uses formatter.worker
├── jwt-decoder/          JwtDecoder.tsx
├── markdown-editor/      MarkdownEditor.tsx, MarkdownPreview.tsx
├── mermaid-editor/       MermaidEditor.tsx
├── prompt-templates/     PromptTemplates.tsx
├── refactoring-toolkit/  RefactoringToolkit.tsx    ← uses refactoring.worker
├── regex-tester/         RegexTester.tsx           ← uses regex.worker
├── snippets/              SnippetsManager.tsx
├── timestamp-converter/  TimestampConverter.tsx
├── ts-playground/        TsPlayground.tsx          ← uses typescript.worker
├── url-codec/             UrlCodec.tsx
├── uuid-generator/        UuidGenerator.tsx
├── xml-tools/             XmlTools.tsx             ← uses xml.worker
├── yaml-tools/            YamlTools.tsx
└── placeholder/            Placeholder.tsx          ← fallback/empty-state component, not a registered tool
```

Tool-level tests live separately in `src/tools/__tests__/<tool-id>.test.tsx` (see AGENTS.md § Test
file location) — not co-located with the components above.

### `src/workers/` — Web Workers

| File                    | Purpose                                                             | Used By                    |
| ----------------------- | ------------------------------------------------------------------- | -------------------------- |
| `rpc.ts`                | `handleRpc(api)` — Worker-side message handler (replaces Comlink)   | All workers                |
| `formatter.worker.ts`   | Prettier + sql-formatter for all language formatting                | code-formatter, json-tools |
| `diff.worker.ts`        | `createTwoFilesPatch()` diff computation                            | diff-viewer                |
| `typescript.worker.ts`  | `ts.transpileModule()` TypeScript → JavaScript                      | ts-playground              |
| `xml.worker.ts`         | xmldom validate + format + XPath                                    | xml-tools                  |
| `refactoring.worker.ts` | AST transforms (var→let/const, Promise→async/await, require→import) | refactoring-toolkit        |
| `regex.worker.ts`       | Regex evaluation with infinite-loop guard                           | regex-tester               |

Each worker pairs with a `*.api.ts` file (e.g. `formatter.api.ts`) defining the typed RPC surface
consumed via `useWorker`.

### `src/types/` — TypeScript Types

| File        | Contains                                                               |
| ----------- | ---------------------------------------------------------------------- |
| `models.ts` | `AppSettings`, `Note`, `Snippet`, `HistoryEntry`, `NoteColor`, `Theme` |
| `tools.ts`  | `ToolDefinition`, `ToolGroup`                                          |

---

## `src-tauri/` — Rust / Tauri Backend

```
src-tauri/
├── src/
│   ├── main.rs               ← Tauri app entry (window config, plugins)
│   ├── lib.rs                ← Tauri commands + migration registry
│   ├── batch.rs               ← Batched/bulk IPC command handlers
│   └── mcp/                   ← Model Context Protocol server integration
│       ├── mod.rs
│       ├── service.rs
│       └── types.rs
├── capabilities/
│   └── default.json          ← IPC permissions (MUST update when adding new APIs)
├── migrations/
│   ├── 001_initial.sql              ← Full DB schema (tables + indexes)
│   ├── 002_api_client.sql            ← api_environments, api_collections, api_requests tables
│   ├── 003_notes_tags.sql             ← adds tags column to notes table
│   ├── 004_history_metadata.sql        ← adds metadata columns to history table
│   ├── 005_snippets_folder.sql          ← adds folder column to snippets table
│   ├── 006_prompt_templates.sql          ← user_prompt_templates table
│   ├── 007_prompt_template_authors.sql    ← author metadata on prompt templates
│   ├── 008_notes_sort_order.sql            ← adds sort_order column to notes table
│   └── 009_persistence_backfills.sql        ← backfills for prior migrations' NULL columns
├── icons/                     ← App icons (all sizes)
└── tauri.conf.json            ← Window size/min, bundle config, app identifier
```

Every migration file must also be registered as a `Migration { version: N, ... }` entry in
`lib.rs` — the SQL file alone does nothing (see AGENTS.md § SQLite Migrations).

**Key config values** (`tauri.conf.json`):

- App identifier: `com.devdrivr.cockpit`
- Default window: `1200×800`, min `800×500`
- SQLite DB: `cockpit.db` (in `~/Library/Application Support/com.devdrivr.cockpit/` on macOS)
- CSP: `null` (no content security policy restrictions)

**IPC Permissions** (`capabilities/default.json`) — add here when using a new Tauri API. Current
grants include `core:window:*` (size/position/focus/always-on-top), `sql:default` +
`sql:allow-execute`, `fs:default` plus explicit `fs:allow-read-text-file` /
`fs:allow-write-text-file` / `fs:allow-read-file` / scoped `fs:allow-write-file` and
`fs:allow-mkdir` (limited to `$DOWNLOAD/**` and `$HOME/**`), scoped `http:default` (allow-listed to
`github.com` and `objects.githubusercontent.com` for the updater), and `dialog:default`.

---

## Key File Quick Reference

| Task                       | File                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Add a new tool             | `src/app/tool-registry.ts` + `src/app/tool-groups.tsx` + `src/tools/<id>/`                      |
| Change a keyboard shortcut | `src/hooks/useGlobalShortcuts.ts`                                                               |
| Add a setting              | `src/types/models.ts` → `AppSettings` + `DEFAULT_SETTINGS`, then `src/stores/settings.store.ts` |
| Change DB schema           | `src-tauri/migrations/` — add a new numbered migration file, then register it in `lib.rs`       |
| Add a Tauri API            | `src-tauri/capabilities/default.json` + permissions                                             |
| Change theme colors        | `src/index.css` (`:root` dark + `.light` overrides)                                             |
| Change Monaco theme        | `src/hooks/useMonaco.ts`, `src/lib/editor-themes/`                                              |
| Debug SQLite data          | `sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db`                        |
| Add a worker               | `src/workers/<name>.worker.ts` → `handleRpc(api)`, `?worker` import in tool                     |
