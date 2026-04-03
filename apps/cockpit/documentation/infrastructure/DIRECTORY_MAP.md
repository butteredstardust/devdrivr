# DIRECTORY MAP — devdrivr cockpit

> Everything you need to find any file in under 10 seconds.

---

## Top-Level Layout

```
apps/cockpit/
├── documentation/          ← You are here
├── src/                    ← All application source
├── src-tauri/              ← Rust/Tauri backend
├── public/                 ← Static assets (favicon, etc.)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vitest.config.ts
└── CLAUDE.md               ← AI dev guidance (read this)
```

---

## `src/` — Application Source

### `src/app/` — Bootstrap & Registry

| File               | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `App.tsx`          | Root component: `<Sidebar> + <Workspace> + <NotesDrawer>` in a flex row       |
| `providers.tsx`    | **Boot sequence**: window geometry → stores → active tool → listeners         |
| `tool-registry.ts` | **Single source of truth** for all 27 tools (React.lazy, IDs, labels, groups) |
| `tool-groups.tsx`  | Sidebar group metadata: id, label, Phosphor icon per group                    |

### `src/components/shell/` — App Chrome

| File                 | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `Sidebar.tsx`        | Left tool list; collapsible (40px ↔ 208px); group headers                |
| `SidebarGroup.tsx`   | A single expandable group in the sidebar                                 |
| `SidebarItem.tsx`    | One tool link in the sidebar                                             |
| `SidebarFooter.tsx`  | Theme toggle + notes + collapse button at sidebar bottom                 |
| `Workspace.tsx`      | Renders active tool via lazy import + Suspense + ErrorBoundary           |
| `NotesDrawer.tsx`    | Right panel: sticky notes + history tabs; **resizable** (drag left edge) |
| `CommandPalette.tsx` | `Cmd+K` fuzzy search over all tools (Fuse.js)                            |
| `SettingsPanel.tsx`  | Slide-in settings: theme, font size, keybindings, history retention      |
| `ShortcutsModal.tsx` | `Cmd+/` keyboard reference modal                                         |
| `StatusBar.tsx`      | Bottom bar: last action feedback + active tool name                      |

### `src/components/shared/` — Reusable UI

| File                | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `Button.tsx`        | Button with `variant` prop (primary, secondary, ghost, danger) |
| `CopyButton.tsx`    | Copy-to-clipboard with success flash                           |
| `TabBar.tsx`        | Horizontal tab navigation (used in multi-tab tools)            |
| `Toggle.tsx`        | Animated toggle switch                                         |
| `Toast.tsx`         | Auto-dismissing notification popup (3s)                        |
| `SendToMenu.tsx`    | Context menu for sending content between tools                 |
| `ErrorBoundary.tsx` | Class component fallback for tool crashes                      |
| `Chameleon.tsx`     | App logo / branding                                            |

### `src/hooks/` — Custom Hooks

| File                     | Returns / Purpose                                                    |
| ------------------------ | -------------------------------------------------------------------- |
| `useWorker.ts`           | `WorkerRpc<T> \| null` — RPC wrapper for Web Workers (no Comlink)    |
| `useToolState.ts`        | `[state, setState]` — Per-tool SQLite persistence with 2s debounce   |
| `useToolAction.ts`       | Subscribe to shell→tool actions (execute, copy, open-file, etc.)     |
| `useGlobalShortcuts.ts`  | `void` — Registers all global keyboard shortcuts                     |
| `useKeyboardShortcut.ts` | Register a single `{ key, mod?, shift?, alt? }` shortcut             |
| `useMonaco.ts`           | Syncs Monaco editor theme with app theme; exports `EDITOR_OPTIONS`   |
| `useFormatter.ts`        | `{ format, detectLanguage }` — Main-thread Prettier (cached plugins) |
| `usePlatform.ts`         | `{ platform, isMac, modKey, modSymbol }` — OS detection (cached)     |
| `useFileDropZone.ts`     | `{ isDragging }` — Tauri file drop to content handler                |

### `src/lib/` — Core Libraries

| File              | Purpose                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `db.ts`           | **All SQLite access.** Promise singleton `getDb()`. CRUD for all tables.             |
| `theme.ts`        | `applyTheme(theme)` — Applies CSS class + localStorage cache                         |
| `tool-actions.ts` | Pub/sub for shell↔tool communication (`dispatchToolAction`, `useToolActionListener`) |
| `platform.ts`     | `detectPlatform()` — Cached OS detection                                             |
| `keybindings.ts`  | Combo matching + human-readable formatting (`⌘K`, `Ctrl+K`)                          |
| `file-io.ts`      | `openFile()` / `saveFile()` — Tauri dialog wrappers                                  |

### `src/stores/` — Zustand Stores

| File                  | What It Holds                                                | Persistence                                                  |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `settings.store.ts`   | Theme, sidebar, drawer, editor prefs                         | SQLite `settings` → `appSettings` key                        |
| `ui.store.ts`         | Active tool, modals open, toasts, pendingSendTo              | None (transient)                                             |
| `notes.store.ts`      | All sticky notes (color, pinned, bounds)                     | SQLite `notes` table                                         |
| `snippets.store.ts`   | Code snippets with tags                                      | SQLite `snippets` table                                      |
| `history.store.ts`    | Tool execution history (input/output)                        | SQLite `history` table                                       |
| `tool-state.store.ts` | In-memory cache of tool UI states                            | Write-through to SQLite `tool_state`                         |
| `api.store.ts`        | API Client request/response state, environments, collections | SQLite `api_environments`, `api_collections`, `api_requests` |

### `src/tools/` — The 27 Tools

Each tool lives in `src/tools/<id>/` with a single component file:

```
src/tools/
├── api-client/          ApiClient.tsx
├── base64/              Base64Tool.tsx
├── case-converter/      CaseConverter.tsx
├── color-converter/     ColorConverter.tsx
├── css-specificity/     CssSpecificity.tsx
├── css-to-tailwind/     CssToTailwind.tsx
├── css-validator/       CssValidator.tsx
├── curl-to-fetch/       CurlToFetch.tsx
├── diff-viewer/         DiffViewer.tsx          ← uses diff.worker
├── docs-browser/        DocsBrowser.tsx
├── hash-generator/      HashGenerator.tsx
├── html-validator/      HtmlValidator.tsx
├── json-schema-validator/ JsonSchemaValidator.tsx
├── json-tools/          JsonTools.tsx           ← uses formatter.worker
├── jwt-decoder/         JwtDecoder.tsx
├── markdown-editor/     MarkdownEditor.tsx
├── mermaid-editor/      MermaidEditor.tsx
├── refactoring-toolkit/ RefactoringToolkit.tsx
├── regex-tester/        RegexTester.tsx
├── snippets/            SnippetsManager.tsx
├── timestamp-converter/ TimestampConverter.tsx
├── ts-playground/       TsPlayground.tsx        ← uses typescript.worker
├── url-codec/           UrlCodec.tsx
├── uuid-generator/      UuidGenerator.tsx
├── xml-tools/           XmlTools.tsx            ← uses xml.worker
├── yaml-tools/          YamlTools.tsx
│   └── yaml-helpers.ts
└── code-formatter/      CodeFormatter.tsx       ← uses formatter.worker
```

### `src/workers/` — Web Workers

| File                    | Purpose                                                             | Used By                    |
| ----------------------- | ------------------------------------------------------------------- | -------------------------- |
| `rpc.ts`                | `handleRpc(api)` — Worker-side message handler (replaces Comlink)   | All workers                |
| `formatter.worker.ts`   | Prettier + sql-formatter for all language formatting                | code-formatter, json-tools |
| `diff.worker.ts`        | `createTwoFilesPatch()` diff computation                            | diff-viewer                |
| `typescript.worker.ts`  | `ts.transpileModule()` TypeScript → JavaScript                      | ts-playground              |
| `xml.worker.ts`         | xmldom validate + format + XPath                                    | xml-tools                  |
| `refactoring.worker.ts` | AST transforms (var→let/const, Promise→async/await, require→import) | refactoring-toolkit        |

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
│   ├── main.rs              ← Tauri app entry (window config, plugins)
│   └── lib.rs               ← Tauri commands (if any custom Rust)
├── capabilities/
│   └── default.json         ← IPC permissions (MUST update when adding new APIs)
├── migrations/
│   ├── 001_initial.sql      ← Full DB schema (tables + indexes)
│   ├── 002_api_client.sql   ← api_environments, api_collections, api_requests tables
│   └── 003_notes_tags.sql   ← adds tags column to notes table
├── icons/                   ← App icons (all sizes)
└── tauri.conf.json          ← Window size/min, bundle config, app identifier
```

**Key config values** (`tauri.conf.json`):

- App identifier: `com.devdrivr.cockpit`
- Default window: `1200×800`, min `800×500`, centered, native decorations
- SQLite DB: `cockpit.db` (in `~/Library/Application Support/com.devdrivr.cockpit/`)
- CSP: `null` (no content security policy restrictions)

**IPC Permissions** (`capabilities/default.json`) — add here when using a new Tauri API:

```
core:window:*    Window manipulation (size, position, always-on-top)
sql:*            Database read/write
fs:*             File system (read/write text files)
http:*           HTTP requests (api-client tool)
dialog:*         File open/save dialogs
```

---

## Key File Quick Reference

| Task                       | File                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Add a new tool             | `src/app/tool-registry.ts` + `src/app/tool-groups.tsx` + `src/tools/<id>/`                      |
| Change a keyboard shortcut | `src/hooks/useGlobalShortcuts.ts`                                                               |
| Add a setting              | `src/types/models.ts` → `AppSettings` + `DEFAULT_SETTINGS`, then `src/stores/settings.store.ts` |
| Change DB schema           | `src-tauri/migrations/` — add a new numbered migration file (001, 002, 003…)                    |
| Add a Tauri API            | `src-tauri/capabilities/default.json` + permissions                                             |
| Change theme colors        | `src/index.css` (`:root` dark + `.light` overrides)                                             |
| Change Monaco theme        | `src/hooks/useMonaco.ts`                                                                        |
| Debug SQLite data          | `sqlite3 ~/Library/Application\ Support/com.devdrivr.cockpit/cockpit.db`                        |
| Add a worker               | `src/workers/<name>.worker.ts` → `handleRpc(api)`, `?worker` import in tool                     |
