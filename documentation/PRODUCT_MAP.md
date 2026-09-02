# PRODUCT MAP — devdrivr

> **Check this file first.** It tells you what exists, what works, and what the product is.

---

## What Is devdrivr?

A **local-first, keyboard-driven developer utility workspace** built as a native desktop app (Tauri 2 + React 19). It runs entirely on your machine — no cloud, no accounts, no network required (except the API Client tool). All state is persisted to a local SQLite database.

Think of it as a developer's Swiss Army knife: 30 registered tools covering formatting, conversion, testing, network, and writing — all accessible instantly via `Cmd+K`.

---

## Current Status

| Area                    | Status        | Notes                                                    |
| ----------------------- | ------------- | -------------------------------------------------------- |
| Core shell              | ✅ Stable     | Sidebar, notes drawer, command palette, status bar       |
| Registered tools        | ✅ Functional | 30 tools across 7 groups; see inventory below            |
| Worker-based tools      | ✅ Fixed      | Custom RPC replaces Comlink (WebKit Proxy bug)           |
| Notes drawer resize     | ✅ Done       | Drag handle, persisted width                             |
| Settings panel          | ✅ Stable     | Theme, font size, keybindings, history retention         |
| Keyboard shortcuts      | ✅ Stable     | Full shortcut set, tool-local dispatch                   |
| SQLite persistence      | ✅ Stable     | Tool state, notes, snippets, history, settings           |
| Window geometry restore | ✅ Stable     | Position + size persisted, DPI-aware, off-screen clamped |
| Cross-platform builds   | ✅ Configured | Release workflow builds macOS, Windows, and Linux        |
| Workspace tabs          | ✅ Stable     | Keep-alive (4 most recent), duplicate tabs, MRU tracking |
| Unit tests              | ✅ 1893 tests | Stores, tools, shell components, theme, keybindings      |

---

## Tool Inventory (30 Tools)

### Code Group

| Tool                  | ID                    | What It Does                                                                          |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Code Formatter        | `code-formatter`      | Format JS/TS/JSON/CSS/HTML/SQL/YAML/XML/Markdown/GraphQL via Prettier + sql-formatter |
| TypeScript Playground | `ts-playground`       | Compile TypeScript → JavaScript with real stdlib type checking (worker-based)         |
| Diff Viewer           | `diff-viewer`         | Side-by-side & inline diff with syntax highlighting (diff2html)                       |
| Refactoring Toolkit   | `refactoring-toolkit` | 12 jscodeshift codemods with filterable picker, diff preview, apply + undo            |

### Data Group

| Tool                  | ID                      | What It Does                                                                                                                          |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| JSON Tools            | `json-tools`            | Validate, format, minify, sort keys, path query, tree + table beside the editor                                                       |
| XML Tools             | `xml-tools`             | Live validation with line/column; tree, JSON and XPath panes beside the editor                                                        |
| YAML Tools            | `yaml-tools`            | Live validation with line/column; multi-document streams; tree and JSON panes beside the editor                                       |
| JSON Schema Validator | `json-schema-validator` | Live Ajv validation with a clickable problems list, templates, schema inference, and strict mode                                      |
| CSV Tools             | `csv-tools`             | Sortable/filterable table beside the source, JSON/TSV/Markdown/SQL conversion, column statistics, generated TypeScript or SQL schemas |

### Web Group

| Tool            | ID                | What It Does                                                                                                                     |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CSS Validator   | `css-validator`   | Specification-backed checking with a clickable problems list, a specificity ranking, and formatting                              |
| HTML Validator  | `html-validator`  | Live HTMLHint validation with a clickable problems list, accessibility rules, heading outline, sandboxed preview, and formatting |
| CSS Specificity | `css-specificity` | Calculate & compare CSS selector specificity scores                                                                              |
| CSS → Tailwind  | `css-to-tailwind` | Convert raw CSS properties to Tailwind utility classes                                                                           |

### Convert Group

| Tool                | ID                    | What It Does                                                                                 |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| Case Converter      | `case-converter`      | All case formats: camelCase, snake_case, kebab-case, PascalCase, SCREAMING_SNAKE, Title Case |
| Color Converter     | `color-converter`     | hex ↔ rgb ↔ hsl ↔ oklch; WCAG contrast ratio; named colors                                   |
| Timestamp Converter | `timestamp-converter` | Unix timestamp ↔ human date; timezone-aware; relative time                                   |
| Base64              | `base64`              | Encode/decode Base64, UTF-8 safe, file support                                               |
| URL Encode/Decode   | `url-codec`           | URL encode/decode; query parameter extraction                                                |
| cURL → Fetch        | `curl-to-fetch`       | Convert cURL commands to fetch / axios / ky                                                  |
| UUID Generator      | `uuid-generator`      | Generate & validate UUIDs v4 (crypto.randomUUID)                                             |
| Hash Generator      | `hash-generator`      | MD5 (js-md5), SHA-1/256/512 (crypto.subtle)                                                  |
| Image Tool          | `image-tool`          | Resize, crop, compress, and convert images (JPEG, PNG, WebP)                                 |

### Test Group

| Tool         | ID             | What It Does                                                   |
| ------------ | -------------- | -------------------------------------------------------------- |
| Regex Tester | `regex-tester` | Live regex matching with group extraction, infinite-loop guard |
| JWT Decoder  | `jwt-decoder`  | Decode header/payload/signature; expiry detection              |

### Network Group

| Tool         | ID             | What It Does                                                  |
| ------------ | -------------- | ------------------------------------------------------------- |
| API Client   | `api-client`   | Full HTTP client via Tauri's HTTP plugin; headers, body, auth |
| Docs Browser | `docs-browser` | Embedded devdocs.io iframe for offline-ish docs browsing      |

### Write Group

| Tool             | ID                 | What It Does                                                        |
| ---------------- | ------------------ | ------------------------------------------------------------------- |
| Markdown Editor  | `markdown-editor`  | Split-pane edit + preview; GFM; Mermaid diagrams; HTML export       |
| Mermaid Editor   | `mermaid-editor`   | Edit & preview Mermaid diagrams; pan/zoom; ⌘O/⌘S; SVG/PNG export    |
| Snippets         | `snippets`         | CRUD code snippets with tags, fuzzy search, import/export           |
| Prompt Templates | `prompt-templates` | Fill curated AI prompt templates with variables and token estimates |

---

## Persistent Data

Everything lives in `~/Library/Application Support/com.devdrivr.devdrivr/devdrivr.db`:

| Table                   | Contains                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `settings`              | All app preferences (theme, window bounds, active tool, etc.)             |
| `tool_state`            | Per-tab UI state (restores between sessions); see note below              |
| `notes`                 | Sticky notes with colors, pin state, size, and tags (added migration 003) |
| `snippets`              | Code snippets with tags                                                   |
| `history`               | Tool execution history (input/output pairs)                               |
| `api_environments`      | API Client saved environments (base URL, headers)                         |
| `api_collections`       | API Client request collections                                            |
| `api_requests`          | Saved API requests with method, URL, headers, body                        |
| `user_prompt_templates` | Built-in and user-created prompt templates                                |

`tool_state.tool_id` holds a tab's **state key**, not always a bare tool id. The first tab of a tool
keeps the bare id (`json-tools`), so state written before tabs could be duplicated is still read;
every additional tab of the same tool gets `<toolId>#<tabId>`. Keys are assigned left-to-right when
tabs are restored, and a surviving tab keeps its key when a sibling closes. Closing a duplicate tab
deletes its row — the tab id never comes round again — while bare-keyed rows are always kept.

---

## Keyboard Shortcuts (Global)

| Shortcut          | Action                                   |
| ----------------- | ---------------------------------------- |
| `Cmd+K`           | Command palette (fuzzy search all tools) |
| `Cmd+B`           | Toggle sidebar                           |
| `Cmd+Shift+N`     | Toggle notes drawer                      |
| `Cmd+Shift+T`     | Cycle theme (dark → light → system)      |
| `Cmd+]` / `Cmd+[` | Next / previous tool                     |
| `Cmd+Enter`       | Execute active tool (format, run, etc.)  |
| `Cmd+Shift+C`     | Copy tool output                         |
| `Cmd+O`           | Open file                                |
| `Cmd+S`           | Save output to file                      |
| `Cmd+,`           | Settings panel                           |
| `Cmd+Shift+P`     | Toggle always-on-top                     |
| `Cmd+/`           | Keyboard shortcuts reference             |
| `Cmd+1/2/3`       | Switch to workspace tab 1 / 2 / 3        |
| `Cmd+W`           | Close current workspace tab              |

> On Windows/Linux, replace `Cmd` with `Ctrl`.

---

## Platform Support

| Platform        | Status                                                         |
| --------------- | -------------------------------------------------------------- |
| macOS (primary) | ✅ Primary development and release target                      |
| Windows         | ✅ Release build configured; manual smoke required per release |
| Linux           | ✅ Release build configured; manual smoke required per release |
