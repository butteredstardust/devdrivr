# Developer Cockpit — Product Requirements Document

## 1. Summary

A Tauri 2 desktop application (macOS + Windows) that consolidates common developer tools into a single keyboard-driven workspace. Replaces daily use of jsonlint, beautifier.io, xmllint, convertcase, devdocs, Postman, Typora, StackEdit, and desktop sticky notes. Design inspired by [pxlkit.xyz](https://pxlkit.xyz) — retro pixel-art aesthetic, dark/light theme, sub-50ms interactions.

---

## 2. Goals

- Eliminate context-switching between browser-based dev tools
- Provide instant, persistent working memory (notes, snippets, history)
- Enable fast code transformations and formatting
- Maintain <50ms interaction latency on all operations
- Work offline with zero cloud dependency

---

## 3. Non-Goals

- No collaboration features
- No cloud sync (all data local)
- No full IDE replacement
- No plugin ecosystem

---

## 4. Platform & Architecture

### 4.1 Stack

| Layer | Technology | Best Practice |
|---|---|---|
| Shell | **Tauri 2** (latest stable) | Use Tauri 2 security model with capability-based permissions. Separate frontend from Rust backend via IPC commands. |
| Frontend | **React 19 + TypeScript 5.9** (strict mode) | Functional components only. All props typed, no `any`. Use React.lazy + Suspense for tool-level code splitting. |
| State | **Zustand** with `persist` middleware | One store per domain (ui, snippets, notes, history, settings). Persist to SQLite via custom storage adapter. Never put derived state in stores — use selectors. |
| Editor | **Monaco Editor** | Single shared configuration. Lazy-load language workers. Use `editor.create` not `editor.createDiffEditor` except for diff tool. Dispose instances on unmount. |
| Heavy processing | **Web Workers** | All formatting, diffing, AST transforms, XML parsing run off main thread. Use `comlink` for typed worker communication. |
| Storage | **SQLite via `tauri-plugin-sql`** | Migrations managed in Rust side. Use WAL mode for concurrent reads. Parameterized queries only — no string interpolation. |
| File I/O | **Tauri filesystem API** | Scoped access via capability permissions. Never access paths outside user-selected directories. |
| Styling | **Tailwind CSS 4** | Design tokens in CSS variables for theme switching. No inline styles. Utility-first, extract components only when repeated 3+ times. |

### 4.2 Key Libraries

| Purpose | Library | Notes |
|---|---|---|
| Formatting | `prettier` + plugins | SQL via `prettier-plugin-sql`, all others built-in. Run in Web Worker. |
| Diffing | `diff` + `diff2html` | Compute in worker, render in main thread. |
| Markdown | `unified` + `remark` + `rehype` | Full GFM support. Mermaid via `rehype-mermaid`. Sanitize HTML output. |
| Mermaid | `mermaid` | Lazy-loaded, render in iframe sandbox for security. |
| Fuzzy search | `fuse.js` | Used for command palette, snippets, notes search. |
| XML | `@xmldom/xmldom` | Parse/validate in worker. |
| AST transforms | `jscodeshift` | Refactoring toolkit. Run in worker. Always preview via diff. |
| TypeScript | `typescript` (compiler API) | TS playground transpilation. Run in worker. |
| HTTP client | `@tauri-apps/plugin-http` | API client uses Tauri's native HTTP, not browser fetch — avoids CORS entirely. |
| Tailwind conversion | `css-to-tailwindcss` | CSS→Tailwind converter. |

### 4.3 Project Structure

```
apps/cockpit/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri entry, IPC commands
│   │   ├── db.rs                # SQLite setup, migrations
│   │   └── commands/            # Rust IPC command handlers
│   ├── migrations/              # SQLite migrations
│   ├── capabilities/            # Tauri 2 permission files
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── app/
│   │   ├── App.tsx              # Shell: sidebar + workspace + drawer
│   │   ├── routes.tsx           # Tool routing
│   │   └── providers.tsx        # Theme, store, error boundary providers
│   ├── components/
│   │   ├── shell/               # Sidebar, StatusBar, NotesDrawer, CommandPalette
│   │   └── shared/              # Reusable: MonacoWrapper, TabBar, ErrorPanel, CopyButton
│   ├── tools/                   # One directory per tool
│   │   ├── json-tools/
│   │   ├── code-formatter/
│   │   ├── xml-tools/
│   │   ├── diff-viewer/
│   │   ├── markdown-editor/
│   │   ├── mermaid-editor/
│   │   ├── case-converter/
│   │   ├── api-client/
│   │   ├── docs-browser/
│   │   ├── snippets/
│   │   ├── regex-tester/
│   │   ├── jwt-decoder/
│   │   ├── base64/
│   │   ├── url-codec/
│   │   ├── timestamp-converter/
│   │   ├── color-converter/
│   │   ├── uuid-generator/
│   │   ├── hash-generator/
│   │   ├── curl-to-fetch/
│   │   ├── ts-playground/
│   │   ├── json-schema-validator/
│   │   ├── css-validator/
│   │   ├── html-validator/
│   │   ├── css-specificity/
│   │   ├── css-to-tailwind/
│   │   └── refactoring-toolkit/
│   ├── stores/                  # Zustand stores
│   │   ├── ui.store.ts
│   │   ├── snippets.store.ts
│   │   ├── notes.store.ts
│   │   ├── history.store.ts
│   │   └── settings.store.ts
│   ├── workers/                 # Web Workers
│   │   ├── formatter.worker.ts
│   │   ├── diff.worker.ts
│   │   ├── ast.worker.ts
│   │   ├── xml.worker.ts
│   │   └── typescript.worker.ts
│   ├── lib/                     # Pure utilities, no side effects
│   │   ├── db.ts                # SQLite client wrapper
│   │   ├── keybindings.ts       # Shortcut registry
│   │   ├── theme.ts             # Theme tokens + switching logic
│   │   └── platform.ts          # OS detection (Cmd vs Ctrl)
│   ├── hooks/                   # React hooks
│   │   ├── useMonaco.ts
│   │   ├── useWorker.ts
│   │   ├── useKeyboardShortcut.ts
│   │   └── useToolState.ts      # Per-tool state persistence
│   └── types/                   # Shared TypeScript types
│       ├── tools.ts
│       ├── models.ts
│       └── ipc.ts
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts               # Tauri uses Vite
```

### 4.4 Best Practices — Enforced

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. No `any`, no `as` casts without comment justifying.
- **React** — No class components. No `useEffect` for derived state (use `useMemo`/selectors). Error boundaries around every tool. Suspense for lazy-loaded tools.
- **Zustand** — Atomic selectors (`useStore(s => s.field)` not `useStore()`). `immer` middleware for complex updates. `persist` middleware with SQLite adapter.
- **Monaco** — Dispose editor instances on component unmount. Share theme/font config globally. Never create multiple editor instances for the same DOM node.
- **Web Workers** — Use `comlink` for typed RPC. Transfer large strings via `Transferable` when possible. Terminate workers on tool unmount.
- **Tauri IPC** — Type all commands with shared TypeScript types matching Rust structs. Use `invoke` with proper error handling. Never expose broad filesystem permissions.
- **SQLite** — WAL mode. Parameterized queries only. Migrations versioned and sequential. Indexes on frequently queried columns (tags, timestamps, tool names).
- **CSS/Tailwind** — No `!important`. Design tokens as CSS custom properties. Dark/light themes via `class` strategy on `<html>`. Responsive not required (desktop app) but respect system font scaling.
- **Error handling** — All async operations wrapped in try/catch. User-visible errors shown in status bar or error panel, never console-only. Worker errors propagated to main thread.
- **Testing** — Vitest for unit tests (stores, utilities, workers). Playwright for E2E (critical user flows). Each tool has at least one happy-path integration test.

---

## 5. Layout & Navigation

### 5.1 Shell Structure

```
┌──────┬──────────────────────────────────────┬────────────┐
│      │  Tool Header  [Tab1] [Tab2] [Tab3]  │            │
│ Icon │──────────────────────────────────────│   Notes    │
│ Side │                                      │   Drawer   │
│ bar  │         Main Workspace               │ (collapsi- │
│      │                                      │   ble)     │
│      │                                      │            │
│      │──────────────────────────────────────│            │
│      │  Error Panel (collapsible)           │            │
├──────┴──────────────────────────────────────┴────────────┤
│  Status Bar: [tool name]  [last action result]  [theme]  │
└──────────────────────────────────────────────────────────┘
```

- **Sidebar** — Narrow icon rail. Groups separated by subtle dividers. Active tool highlighted with accent color. Hover shows tool name + shortcut. Sidebar can be collapsed (Cmd/Ctrl+B).
- **Workspace** — Full remaining width. Each tool renders here. State preserved when switching tools.
- **Notes Drawer** — Right side, collapsible. Shows sticky note cards. Pin, color-label, reorder. Markdown rendering per note.
- **Status Bar** — Current tool, last action result ("Valid JSON", "Formatted", "Copied"), theme toggle icon.
- **Command Palette** — Floating overlay (Cmd/Ctrl+K). Searches tools, snippets, notes, history, settings. Prefixes: `>` tools, `@` snippets, `#` notes.

### 5.2 Sidebar Tool Groups

| Group | Icon | Tools |
|---|---|---|
| **Code** | `</>` | Code Formatter, TypeScript Playground, Diff Viewer, Refactoring Toolkit |
| **Data** | `{}` | JSON Tools, XML Tools, JSON Schema Validator |
| **Web** | `◈` | CSS Validator, HTML Validator, CSS Specificity Calc, CSS→Tailwind |
| **Convert** | `⇄` | Case Converter, Color Converter, Timestamp Converter, Base64, URL Encode/Decode, cURL→Fetch, UUID Generator, Hash Generator |
| **Test** | `✓` | Regex Tester, JWT Decoder |
| **Network** | `↗` | API Client, Docs Browser |
| **Write** | `✎` | Markdown Editor, Mermaid Editor, Snippets |

### 5.3 Keyboard Shortcuts

All shortcuts use Cmd on macOS, Ctrl on Windows. Tauri handles this natively.

| Action | Shortcut |
|---|---|
| Command palette | Cmd/Ctrl+K |
| Toggle notes drawer | Cmd/Ctrl+Shift+N |
| Toggle sidebar | Cmd/Ctrl+B |
| Cycle tools forward/back | Cmd/Ctrl+] / Cmd/Ctrl+[ |
| Format / execute current tool | Cmd/Ctrl+Enter |
| Copy output | Cmd/Ctrl+Shift+C |
| Switch sub-tab 1/2/3 | Cmd/Ctrl+1/2/3 |
| Open file into current tool | Cmd/Ctrl+O |
| Save output to file | Cmd/Ctrl+S |
| Settings | Cmd/Ctrl+, |
| Quick capture note | Cmd/Ctrl+Shift+Space (global, works when app is background) |
| Always on top toggle | Cmd/Ctrl+Shift+P |
| Toggle dark/light theme | Cmd/Ctrl+Shift+T |

---

## 6. Features

### 6.1 JSON Tools

**Replaces:** jsonlint.com, json2table.de

**Sub-tabs:** Lint & Format | Tree View | Table View

- **Lint & Format** — Monaco editor with JSON language mode. Validates on keystroke (debounced 300ms). Format button runs Prettier in worker. Errors shown as inline markers + error panel with line numbers.
- **Tree View** — Collapsible tree rendered from parsed JSON. Click a node to copy its path (`data.users[0].name`). Search/filter nodes.
- **Table View** — Renders array-of-objects as a sortable table using `@tanstack/react-table`. Copy cell, copy row, copy column. Export as CSV.

### 6.2 Code Formatter

**Replaces:** beautifier.io

**Languages:** JavaScript, TypeScript, CSS, HTML, SQL, Python, JSON, Markdown, YAML

- Monaco editor with auto-detected language (can override manually).
- Format via Prettier in Web Worker (Cmd/Ctrl+Enter).
- Language-specific options: indent size (2/4/tab), quote style, trailing commas. Defaults from app settings, overridable per session.
- Format-on-paste option (off by default).
- Shows before/after diff on request.

### 6.3 XML Tools

**Replaces:** xmllint.com

**Sub-tabs:** Lint & Format | Tree View

- Validate XML syntax, show errors with line numbers.
- Format/prettify XML with configurable indent.
- Tree view for navigating XML structure.
- XPath query support — enter an XPath, see matching nodes highlighted.

### 6.4 Diff Viewer

**Modes:** Side-by-side | Inline

- Two Monaco editors (left/right) for input.
- Diff computed in Web Worker via `diff` library.
- Rendered with syntax highlighting via `diff2html`.
- JSON-aware mode: sorts keys before diffing for structural comparison.
- Whitespace toggle: show/ignore whitespace differences.
- File drag-and-drop onto left/right panels.

### 6.5 Markdown Editor

**Replaces:** Typora, StackEdit

**Modes:** Inline preview (Typora-style) | Split (edit + preview side-by-side) | Preview only

- Monaco editor with markdown language mode.
- Live rendering via `unified` / `remark` / `rehype` pipeline.
- Full GFM support: tables, task lists, footnotes, strikethrough.
- Mermaid diagram rendering inline via fenced code blocks.
- Syntax highlighting in code blocks via `rehype-highlight`.
- Open `.md` files from disk, save back to disk.
- Export as HTML.
- Scroll sync between editor and preview in split mode.
- Image support: paste image from clipboard → save to temp dir → embed.

### 6.6 Mermaid Editor

**Standalone diagram editor for mermaid syntax.**

- Monaco editor with mermaid language hints.
- Live preview panel rendering the diagram.
- Export as SVG or PNG.
- Template gallery: flowchart, sequence, class, ER, gantt, state, pie.
- Error feedback when syntax is invalid.

### 6.7 Case Converter

**Replaces:** convertcase.net

- Input text area.
- One-click buttons for: UPPERCASE, lowercase, Title Case, Sentence case, camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, kebab-case, dot.case, path/case, CONSTANT_CASE.
- Click any output to copy. All conversions shown simultaneously.

### 6.8 API Client

**Replaces:** Postman (basic usage)

- Method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
- URL input with query parameter builder.
- Headers: key-value editor with common header autocomplete.
- Body: Monaco editor with JSON/XML/form-data/raw modes.
- Send request via `@tauri-apps/plugin-http` (no CORS issues).
- Response panel: status code, headers, body with syntax highlighting, timing.
- Response body viewable as raw, prettified, or table (for JSON arrays).

### 6.9 Docs Browser

**Replaces:** devdocs.io browser tab

- Embedded Tauri webview loading devdocs.io.
- Keyboard shortcut to focus/toggle (within sidebar navigation).
- No additional implementation needed — webview handles everything.

### 6.10 Snippets Manager

- Create, edit, delete snippets.
- Fields: title, content (Monaco editor), language, tags.
- Fuzzy search by title, content, tags via `fuse.js`.
- Copy snippet content on Enter or click.
- Import/export as JSON file.
- Promote any tool output to snippet via "Send to → Snippets" or right-click.

### 6.11 Notes (Sticky Notes System)

**Replaces:** Desktop sticky notes

Notes are a **first-class system feature**, not a regular tool. They live in the right drawer and can pop out as floating windows.

- **Drawer view** — Cards with title, color label (8 colors), pin toggle, creation date. Pinned notes at top. Markdown rendered inline. Click to expand/edit.
- **Pop-out windows** — Any note can detach into a floating always-on-top mini-window (Tauri multi-window). Position and size remembered per note.
- **Quick capture** — Global hotkey (Cmd/Ctrl+Shift+Space) opens a small capture window from anywhere, even when app is backgrounded. Type, hit Enter, note saved.
- **Clipboard capture** — Option to auto-create note from clipboard content.
- **Search** — Fuzzy search across all notes from command palette (`#` prefix) or drawer search bar.

### 6.12 History

Cross-cutting system feature visible in the notes drawer (separate tab from notes).

- Logs every tool operation: tool name, input, output, timestamp.
- Searchable and filterable by tool.
- Click to reload an operation into its tool.
- Promote any history entry to a snippet.
- Auto-prune: keep last 500 entries per tool. Configurable in settings.

### 6.13 Regex Tester

- Pattern input with flags (g, i, m, s, u).
- Test string input (Monaco editor).
- Real-time match highlighting in the test string.
- Match results panel: full matches, capture groups with names, indices.
- Common regex reference sidebar (collapsible).

### 6.14 JWT Decoder

- Paste a JWT token.
- Instantly decode and display: header, payload (JSON formatted), signature.
- Expiry check: show human-readable expiry time and whether token is expired.
- Color-coded sections (header = blue, payload = green, signature = red).
- No verification (no secret input) — decode only, as expected for a dev tool.

### 6.15 Base64 Encode/Decode

- Two panels: input and output.
- Toggle direction: encode ↔ decode.
- Auto-detect if input is valid Base64.
- Support text and file input (drag-and-drop a file to encode).

### 6.16 URL Encode/Decode

- Two panels: input and output.
- Toggle direction: encode ↔ decode.
- Component mode (encodeURIComponent) vs full URL mode (encodeURI).
- Parse URL into structured parts (protocol, host, path, query params, fragment).

### 6.17 Timestamp Converter

- Input: Unix timestamp (seconds or milliseconds) or human-readable date string.
- Output: all formats simultaneously — Unix seconds, Unix milliseconds, ISO 8601, RFC 2822, relative ("3 hours ago"), and local time in configured timezone.
- "Now" button to insert current timestamp.
- Timezone selector (defaults from app settings).

### 6.18 Color Converter

- Input any color format: hex, rgb, hsl, oklch, named CSS color.
- Output all formats simultaneously with copy buttons.
- Visual color swatch preview.
- Contrast ratio calculator: input foreground + background, see WCAG AA/AAA pass/fail.

### 6.19 UUID Generator

- Generate UUID v4 (random) on load and on button click.
- Bulk generate: specify count (1-100), get list.
- Copy individual or all.
- Validate: paste a string, check if valid UUID and which version.

### 6.20 Hash Generator

- Input text.
- Output all hash formats simultaneously: MD5, SHA-1, SHA-256, SHA-512.
- File input: drag-and-drop a file to hash.
- Copy individual hash values.

### 6.21 cURL → Fetch Converter

- Input: paste a cURL command (from browser DevTools "Copy as cURL").
- Output: equivalent `fetch()` call, cleanly formatted.
- Also output: `axios`, `ky`, `got` equivalents (tabs).
- Handle common cURL flags: -H, -d, -X, --data-raw, --compressed, -b, -u.

### 6.22 TypeScript Playground

- Left panel: TypeScript input (Monaco with TS language service).
- Right panel: transpiled JavaScript output.
- Compiler options toggle: target (ES5/ES2015/ESNext), module format, strict mode.
- Type errors shown inline in the editor.
- Runs TypeScript compiler in Web Worker.

### 6.23 JSON Schema Validator

- Two editors: JSON data (left) and JSON Schema (right).
- Validate data against schema on keystroke (debounced).
- Errors shown with JSON Pointer paths and human-readable messages.
- Load schema from URL (fetches via Tauri HTTP).
- Common schema templates: OpenAPI, JSON:API, GeoJSON.

### 6.24 CSS Validator

- Monaco editor with CSS language mode.
- Validate CSS syntax, show errors with line numbers.
- Warn on deprecated properties, browser-compatibility issues.
- Use `css-tree` for parsing/validation.

### 6.25 HTML Validator

- Monaco editor with HTML language mode.
- Validate HTML structure, unclosed tags, nesting issues.
- Accessibility hints: missing alt attributes, missing labels, ARIA issues.
- Use `htmlhint` or `html-validate`.

### 6.26 CSS Specificity Calculator

- Input one or more CSS selectors (one per line).
- Output specificity score per selector in (a, b, c) format.
- Visual bar chart comparing selectors.
- Sort by specificity.

### 6.27 CSS → Tailwind Converter

- Input: paste CSS rules.
- Output: equivalent Tailwind CSS classes.
- Show unconvertible properties with fallback suggestions.
- Copy full class string.

### 6.28 Refactoring Toolkit

- Monaco editor input.
- Available transforms (AST-based via jscodeshift in worker):
  - `var` → `let`/`const`
  - `.then()` chains → `async`/`await`
  - Remove `console.log` / `console.debug` / `console.warn` statements
  - Optional chaining conversion (`a && a.b` → `a?.b`)
  - Destructuring transforms
  - Arrow function conversion
- **Always preview as diff before applying.** User confirms or discards.
- Multiple transforms can be selected and applied in sequence.

---

## 7. Cross-Cutting Behaviors

### 7.1 State Persistence

- Every tool's input state persists in memory across tool switches.
- On app quit, current state of all tools serialized to SQLite.
- On app launch, last session restored. Each tool shows its last state.
- Last 10 inputs per tool retained in history.

### 7.2 File I/O

- **Drag-and-drop** a file onto any tool — content loaded, language auto-detected.
- **Cmd/Ctrl+O** — native file picker, content loaded into current tool.
- **Cmd/Ctrl+S** — save current output to disk via native save dialog.
- All file operations use Tauri filesystem API with scoped permissions.

### 7.3 Cross-Tool Flow

- Right-click any output → "Send to → [tool name]" menu.
- Cmd/Ctrl+Shift+T opens the same menu via keyboard.
- Content transferred as input to target tool. Target tool activates.
- Examples: decode JWT → send payload to JSON Tools. Format JSON → send to Diff Viewer.

### 7.4 Error Feedback

- **Inline markers** — Monaco red/yellow squiggly underlines at error positions.
- **Error panel** — Collapsible panel below workspace, lists all errors with line:column. Click to navigate.
- **Status bar** — Brief status: "Valid", "3 errors", "Formatted", "Copied".
- **Toast** — Brief non-blocking notifications for actions (copy, save, export).

### 7.5 Dark / Light Theme

- Toggle via Cmd/Ctrl+Shift+T, status bar icon, or settings.
- Persisted in settings.
- Respects system preference on first launch.
- **Dark theme** — Deep background (#0a0a0a), retro-green accent (#39ff14), pixel-art UI elements.
- **Light theme** — Cream background (#faf8f0), dark text, same accent colors adjusted for contrast. Retro aesthetic maintained.
- Monaco editor theme synced with app theme.
- All design tokens as CSS custom properties — single source of truth for both themes.

### 7.6 Window Behavior

- Remember window position, size, and active tool on restart.
- Always-on-top toggle (Cmd/Ctrl+Shift+P) — persisted.
- Pop-out note windows remember their individual positions.
- Multi-monitor aware — windows stay on the monitor they were placed on.
- Minimum window size: 800×500.

---

## 8. Data Models

```ts
type Snippet = {
  id: string            // nanoid
  title: string
  content: string
  language: string      // e.g. 'javascript', 'sql', 'json'
  tags: string[]
  createdAt: number     // unix ms
  updatedAt: number
}

type Note = {
  id: string
  title: string
  content: string       // markdown
  color: string         // one of 8 predefined colors
  pinned: boolean
  poppedOut: boolean    // whether displayed as floating window
  windowBounds?: {      // position/size when popped out
    x: number
    y: number
    width: number
    height: number
  }
  createdAt: number
  updatedAt: number
}

type HistoryEntry = {
  id: string
  tool: string          // tool identifier
  subTab?: string       // e.g. 'lint', 'tree', 'table'
  input: string
  output: string
  timestamp: number
}

type ToolState = {
  toolId: string
  state: Record<string, unknown>  // tool-specific serialized state
  updatedAt: number
}

type AppSettings = {
  theme: 'dark' | 'light' | 'system'
  alwaysOnTop: boolean
  sidebarCollapsed: boolean
  notesDrawerOpen: boolean
  defaultIndentSize: number
  defaultTimezone: string
  editorFontSize: number
  editorKeybindingMode: 'standard' | 'vim' | 'emacs'
  historyRetentionPerTool: number  // default 500
  formatOnPaste: boolean
}
```

### SQLite Schema

```sql
CREATE TABLE snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_snippets_tags ON snippets(tags);
CREATE INDEX idx_snippets_updated ON snippets(updated_at);

CREATE TABLE notes (
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
CREATE INDEX idx_notes_pinned ON notes(pinned, updated_at);

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  sub_tab TEXT,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_history_tool ON history(tool, timestamp);
CREATE INDEX idx_history_timestamp ON history(timestamp);

CREATE TABLE tool_state (
  tool_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,  -- JSON
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON
);
```

---

## 9. Performance Requirements

| Metric | Target |
|---|---|
| Any UI interaction (click, keystroke) | <50ms response |
| Formatting (typical file <1000 lines) | <200ms |
| Diff computation (two inputs <1000 lines each) | <300ms |
| Tool switch (sidebar click) | <100ms (lazy-loaded tools cached after first load) |
| App cold start | <2s to interactive |
| SQLite query (any) | <10ms |
| Command palette open + search | <50ms |

All formatting, diffing, AST, and XML operations run in Web Workers — main thread never blocked.

---

## 10. Design Language

- **Aesthetic:** Retro pixel-art inspired by [pxlkit.xyz](https://pxlkit.xyz).
- **Fonts:** Pixel/bitmap font for headings and UI labels (e.g. Press Start 2P or Silkscreen). Monospace font for all code surfaces (JetBrains Mono or Fira Code).
- **Colors (dark):** Background #0a0a0a, surface #1a1a1a, accent #39ff14 (retro green), error #ff3333, text #e0e0e0.
- **Colors (light):** Background #faf8f0, surface #ffffff, accent #00875a, error #cc0000, text #1a1a1a.
- **Borders:** 1px solid with subtle pixel-art feel. No rounded corners on primary containers (sharp edges). Small radius (2px) on buttons and inputs.
- **Animations:** Minimal. No transitions longer than 150ms. No decorative animations. Status bar messages fade in/out.
- **Icons:** Pixel-art style icon set or Lucide icons at small size to maintain retro feel.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 28 tools = large bundle size | Code-split every tool via React.lazy. Only active tool loaded. |
| Monaco Editor memory usage with multiple instances | Single Monaco instance per tool, disposed on unmount. Reuse config. |
| Incorrect AST refactors | Always preview as diff. Never auto-apply. User confirms. |
| Web Worker startup latency | Pre-warm formatter worker on app launch. Others lazy. |
| SQLite data loss on crash | WAL mode + periodic checkpoint. Tool state saved on debounced interval (2s), not just on quit. |
| Prettier/TS compiler large WASM | Load in worker, cache after first load. Show loading indicator. |

---

## 12. Future Enhancements

- Local AI assistance (local LLM for code suggestions, natural language transforms)
- Pipeline chaining (connect tool outputs → inputs visually)
- Cloud sync (optional, encrypted)
- Custom tool plugins (user-defined tools via JS)
- Smart refactor suggestions (analyze code, suggest applicable transforms)

---

## 13. Success Criteria

- Replaces all listed external tools for daily development work
- Zero network dependency for core features (only Docs Browser and API Client need network)
- App feels faster than the browser-based tools it replaces
- State never lost — notes, snippets, history survive restarts and crashes

---

Generated: 2026-03-21
