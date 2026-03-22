# PRODUCT MAP — devdrivr cockpit

> **Check this file first.** It tells you what exists, what works, and what the product is.

---

## What Is cockpit?

A **local-first, keyboard-driven developer utility workspace** built as a native desktop app (Tauri 2 + React 19). It runs entirely on your machine — no cloud, no accounts, no network required (except the API Client tool). All state is persisted to a local SQLite database.

Think of it as a developer's Swiss Army knife: 27 tools covering formatting, conversion, testing, network, and writing — all accessible instantly via `Cmd+K`.

---

## Current Status

| Area | Status | Notes |
|------|--------|-------|
| Core shell | ✅ Stable | Sidebar, notes drawer, command palette, status bar |
| All 27 tools | ✅ Functional | See tool inventory below |
| Worker-based tools | ✅ Fixed | Custom RPC replaces Comlink (WebKit Proxy bug) |
| Notes drawer resize | ✅ Done | Drag handle, persisted width |
| Settings panel | ✅ Stable | Theme, font size, keybindings, history retention |
| Keyboard shortcuts | ✅ Stable | Full shortcut set, tool-local dispatch |
| SQLite persistence | ✅ Stable | Tool state, notes, snippets, history, settings |
| Window geometry restore | ✅ Stable | Position + size persisted, DPI-aware, off-screen clamped |
| Windows cross-build | 🔲 Planned | GitHub Actions CI/CD planned |
| Unit tests | ✅ 34 tests | Platform, theme, keybindings, registry, notes store |

---

## Tool Inventory (27 Tools)

### Code Group
| Tool | ID | What It Does |
|------|----|-------------|
| Code Formatter | `code-formatter` | Format JS/TS/JSON/CSS/HTML/SQL/YAML/XML/Markdown/GraphQL via Prettier + sql-formatter |
| TypeScript Playground | `ts-playground` | Transpile TypeScript → JavaScript (worker-based) |
| Diff Viewer | `diff-viewer` | Side-by-side & inline diff with syntax highlighting (diff2html) |
| Refactoring Toolkit | `refactoring-toolkit` | AST transforms: var→let/const, Promise.then→async/await, require→import |

### Data Group
| Tool | ID | What It Does |
|------|----|-------------|
| JSON Tools | `json-tools` | Validate, format, tree view, table view |
| XML Tools | `xml-tools` | Validate, format XML; XPath queries |
| JSON Schema Validator | `json-schema-validator` | Validate JSON documents against a JSON Schema (AJV) |

### Web Group
| Tool | ID | What It Does |
|------|----|-------------|
| CSS Validator | `css-validator` | Parse & validate CSS, report errors with line numbers |
| HTML Validator | `html-validator` | HTMLHint-based HTML validation with error/warning counts |
| CSS Specificity | `css-specificity` | Calculate & compare CSS selector specificity scores |
| CSS → Tailwind | `css-to-tailwind` | Convert raw CSS properties to Tailwind utility classes |

### Convert Group
| Tool | ID | What It Does |
|------|----|-------------|
| Case Converter | `case-converter` | All case formats: camelCase, snake_case, kebab-case, PascalCase, SCREAMING_SNAKE, Title Case |
| Color Converter | `color-converter` | hex ↔ rgb ↔ hsl ↔ oklch; WCAG contrast ratio; named colors |
| Timestamp Converter | `timestamp-converter` | Unix timestamp ↔ human date; timezone-aware; relative time |
| Base64 | `base64` | Encode/decode Base64, UTF-8 safe, file support |
| URL Encode/Decode | `url-codec` | URL encode/decode; query parameter extraction |
| cURL → Fetch | `curl-to-fetch` | Convert cURL commands to fetch / axios / ky |
| UUID Generator | `uuid-generator` | Generate & validate UUIDs v4 (crypto.randomUUID) |
| Hash Generator | `hash-generator` | MD5 (js-md5), SHA-1/256/512 (crypto.subtle) |

### Test Group
| Tool | ID | What It Does |
|------|----|-------------|
| Regex Tester | `regex-tester` | Live regex matching with group extraction, infinite-loop guard |
| JWT Decoder | `jwt-decoder` | Decode header/payload/signature; expiry detection |

### Network Group
| Tool | ID | What It Does |
|------|----|-------------|
| API Client | `api-client` | Full HTTP client via Tauri's HTTP plugin; headers, body, auth |
| Docs Browser | `docs-browser` | Embedded devdocs.io iframe for offline-ish docs browsing |

### Write Group
| Tool | ID | What It Does |
|------|----|-------------|
| Markdown Editor | `markdown-editor` | Split-pane edit + preview; GFM; Mermaid diagrams; HTML export |
| Mermaid Editor | `mermaid-editor` | Edit & preview Mermaid diagrams; SVG/PNG export; 7 templates |
| Snippets | `snippets` | CRUD code snippets with tags, fuzzy search, import/export |

---

## Persistent Data

Everything lives in `~/Library/Application Support/com.devdrivr.cockpit/cockpit.db`:

| Table | Contains |
|-------|---------|
| `settings` | All app preferences (theme, window bounds, active tool, etc.) |
| `tool_state` | Per-tool UI state (restores between sessions) |
| `notes` | Sticky notes with colors, pin state, size |
| `snippets` | Code snippets with tags |
| `history` | Tool execution history (input/output pairs) |

---

## Keyboard Shortcuts (Global)

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette (fuzzy search all tools) |
| `Cmd+B` | Toggle sidebar |
| `Cmd+Shift+N` | Toggle notes drawer |
| `Cmd+Shift+T` | Cycle theme (dark → light → system) |
| `Cmd+]` / `Cmd+[` | Next / previous tool |
| `Cmd+Enter` | Execute active tool (format, run, etc.) |
| `Cmd+Shift+C` | Copy tool output |
| `Cmd+O` | Open file |
| `Cmd+S` | Save output to file |
| `Cmd+,` | Settings panel |
| `Cmd+Shift+P` | Toggle always-on-top |
| `Cmd+/` | Keyboard shortcuts reference |
| `Cmd+1/2/3` | Switch tool tab |

> On Windows/Linux, replace `Cmd` with `Ctrl`.

---

## Platform Support

| Platform | Status |
|----------|--------|
| macOS (primary) | ✅ Fully tested |
| Windows | 🔲 Planned (cross-build CI pending) |
| Linux | 🔲 Untested |
