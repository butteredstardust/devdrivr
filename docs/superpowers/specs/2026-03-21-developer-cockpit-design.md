# Developer Cockpit — Design Spec

## 1. Overview

A local-first, keyboard-driven developer utility workspace built as a Tauri 2 desktop application (Mac + Windows). Consolidates 26 common developer tools into a single fast interface to eliminate context switching between external websites and utilities.

**Design aesthetic:** Retro pixel-art inspired by [pxlkit.xyz](https://pxlkit.xyz). Dark/light mode toggle. Pixel font for headings, monospace for code, retro-green/red accent colors. Light mode uses a cream/paper background to maintain the retro feel.

**Target user:** Solo JS/Python web developer. Languages: JavaScript, TypeScript, SQL, Python, Markdown, Mermaid, CSS, HTML, XML.

---

## 2. Goals

- Replace 70%+ of external dev tool websites (jsonlint, beautifier.io, convertcase, etc.)
- Provide instant, persistent working memory (notes, snippets, history)
- Maintain sub-50ms interaction latency for all UI operations
- No cloud backend or account required — the app itself is fully local. Network-dependent tools (API Client, Docs Browser) degrade gracefully when offline with a clear "no connection" indicator

## 3. Non-Goals

- No collaboration features
- No full IDE replacement
- No plugin ecosystem
- No account/login system

---

## 4. Layout & Navigation

### Shell Structure

```
+--------+-----------------------------+------------------+
| Sidebar|       Main Workspace        | Notes Drawer     |
| (icons)|   (active tool renders      | (collapsible)    |
| grouped|    here, full width)        |                  |
| by     |                             | Sticky note cards|
| category|                            | + History tab    |
|        |                             |                  |
+--------+-----------------------------+------------------+
|              Status Bar                                 |
+---------------------------------------------------------+
```

- **Left sidebar:** Narrow icon rail, tools grouped by category with collapsible sections. Active tool highlighted with accent color. Keyboard shortcut hints on hover.
- **Main workspace:** Full remaining width, renders the active tool. Sub-modes within tools (e.g., JSON lint/format/tree/table) use a horizontal tab bar below the tool header, switchable via Cmd/Ctrl+1/2/3. These shortcuts are no-ops when the active tool has no sub-modes.
- **Right notes drawer:** Collapsible (Cmd/Ctrl+Shift+N). Shows sticky note cards with color labels and pinning. Includes a History tab. Always accessible regardless of active tool.
- **Status bar:** Current tool name, last action result (e.g., "Valid JSON", "Formatted", "Copied to clipboard").

### Global Keyboard Shortcuts

| Action | Mac | Windows |
|---|---|---|
| Command palette | Cmd+K | Ctrl+K |
| Cycle tools forward/back | Cmd+] / Cmd+[ | Ctrl+] / Ctrl+[ |
| Toggle notes drawer | Cmd+Shift+N | Ctrl+Shift+N |
| Run / format current tool | Cmd+Enter | Ctrl+Enter |
| Copy output | Cmd+Shift+C | Ctrl+Shift+C |
| Open file into tool | Cmd+O | Ctrl+O |
| Save output to disk | Cmd+S | Ctrl+S |
| Settings | Cmd+, | Ctrl+, |
| Send output to another tool | Cmd+Shift+T | Ctrl+Shift+T |
| Always-on-top toggle | Cmd+Shift+P | Ctrl+Shift+P |
| Quick note capture (global) | Cmd+Shift+Space | Ctrl+Shift+Space |
| Switch sub-mode tabs | Cmd+1/2/3 | Ctrl+1/2/3 |

---

## 5. Tools (26 total)

### 5.1 Code Group

**Code Formatter**
- Languages: JS, CSS, HTML, SQL, Python, JSON, Markdown
- Powered by Prettier (+ SQL plugin)
- Auto-detect language from content
- Configurable indent size per language (in Settings)
- Format on Cmd/Ctrl+Enter

**TypeScript Playground**
- Input: TypeScript code
- Output: Transpiled JavaScript
- Live transpilation as you type (debounced 300ms after last keystroke)
- TypeScript compiler (~8MB) lazy-loaded on first use of this tool
- Show compiler errors inline

**Diff Viewer**
- Two-pane input (left/right)
- Side-by-side and inline toggle
- Syntax-aware highlighting
- JSON-aware structural comparison
- Character-level diff highlighting

**Refactoring Toolkit**
- Supports JavaScript and TypeScript only
- AST-based transforms with always-preview-via-diff
- Initial set:
  - `var` to `let`/`const`
  - `.then()` chains to `async`/`await`
  - Remove `console.log` statements
  - Optional chaining conversion
  - Destructuring transforms

### 5.2 Data Group

**JSON Tools**
- Sub-modes (tab bar): Lint, Format, Tree View, Table View
- Lint: validate with error markers + error panel
- Format: pretty-print with configurable indent
- Tree View: collapsible JSON tree explorer
- Table View: render JSON arrays as sortable tables (replaces json2table.de)

**XML Tools**
- Sub-modes: Lint, Format
- Validate XML syntax with inline error markers
- Pretty-print with configurable indent

**JSON Schema Validator**
- Two-pane: schema (left) + document (right)
- Validate document against schema
- Inline error markers on the document pane

### 5.3 Web Group

**CSS Validator**
- Validate CSS syntax
- Inline error markers + error panel

**HTML Validator**
- W3C-style validation
- Inline error markers + error panel

**CSS Specificity Calculator**
- Input: CSS selector
- Output: Specificity score breakdown (ID, class, element)
- Support multiple selectors, sorted by specificity

**CSS to Tailwind Converter**
- Input: plain CSS
- Output: equivalent Tailwind utility classes
- Best-effort conversion for spacing, display, typography, colors, and layout. Complex or uncommon properties may not convert — shown as comments in output
- Library options limited; may require custom mapping table as fallback

### 5.4 Convert Group

**Case Converter**
- Input: any text
- Output: camelCase, PascalCase, snake_case, kebab-case, UPPER_CASE, Title Case, SQL_NAMING
- All conversions shown simultaneously, click to copy

**Color Converter**
- Input: any color format
- Output: hex, rgb, hsl, oklch
- Color preview swatch
- All formats shown simultaneously, click to copy

**Timestamp Converter**
- Bidirectional: Unix timestamp (seconds/milliseconds) to human-readable and vice versa
- Timezone selector with common zones
- Default timezone configurable in Settings
- Show relative time ("3 hours ago")

**Base64 Encoder/Decoder**
- Toggle encode/decode direction
- Handle text and file input (drag-and-drop binary files)

**URL Encoder/Decoder**
- Toggle encode/decode direction
- Component-level and full-URL encoding

**cURL to Fetch Converter**
- Input: cURL command (paste from browser DevTools)
- Output: clean `fetch()` call with options
- Support headers, body, method, auth

**UUID Generator**
- Generate v4 UUIDs
- One-click copy to clipboard
- Bulk generate (configurable count)
- Show with/without hyphens

**Hash Generator**
- Input: text or file
- Output: MD5, SHA-1, SHA-256, SHA-512
- All hashes shown simultaneously, click to copy

### 5.5 Test Group

**Regex Tester**
- Input: pattern + test string
- Live match highlighting with colored groups
- Group capture display
- Flag toggles (g, i, m, s)
- Common regex reference sidebar

**JWT Decoder**
- Input: paste JWT token
- Output: decoded header, payload (pretty-printed JSON), expiry status
- Color-coded: green = valid/not expired, red = expired
- No signature verification (local tool, no secrets)

### 5.6 Network Group

**API Client**
- Method selector (GET, POST, PUT, PATCH, DELETE)
- URL input, headers key-value editor, body editor (Monaco, JSON/text)
- Response viewer: status code, headers, body (pretty-printed), timing
- No saved collections, environments, or auth flows

**Docs Browser**
- Embedded Tauri webview loading devdocs.io
- Navigation bar for URL entry
- Persists last visited page across sessions
- Requires network connection; shows offline indicator when unavailable

### 5.7 Write Group

**Markdown Editor**
- Side-by-side split mode (raw markdown in Monaco | rendered preview) as primary editing mode
- Optional Typora-style inline WYSIWYG mode via Milkdown (ProseMirror-based Markdown editor)
- Toggle between split and inline modes
- Mermaid block rendering inline
- File open/save via Tauri FS
- Syntax highlighting for fenced code blocks

**Mermaid Editor**
- Dedicated diagram editor with live preview
- Export as SVG and PNG
- Common diagram templates (flowchart, sequence, ER, gantt)

**Snippets Manager**
- Fuzzy search (fuse.js)
- Tagging system
- Language/syntax detection for highlighting
- Copy on Enter
- Create from any tool output ("Save as snippet")

---

## 6. Notes System (First-Class Feature)

Notes are not a sidebar tool — they are a system-level feature accessible from anywhere.

### Notes Drawer (Right Panel)
- Toggle with Cmd/Ctrl+Shift+N
- Visual card layout with color labels
- Pin important notes to top
- Markdown rendering within cards
- Search/filter across notes
- History tab shows all tool actions with timestamps

### Pop-Out Notes
- Any note can be popped out as a floating always-on-top mini-window
- Tauri multi-window support
- Float over IDE like desktop sticky notes
- Edit in-place, auto-saves

### Global Quick Capture
- System-wide hotkey: Cmd/Ctrl+Shift+Space
- Opens small capture window even when app is in background
- Type note, hit Enter, saved and dismissed
- No context switch required

---

## 7. Cross-Cutting Features

### Command Palette (Cmd/Ctrl+K)
- Searches everything: tools, snippets, notes, history, settings
- Scoped prefixes for power users:
  - `>` for tools
  - `@` for snippets
  - `#` for notes
  - `!` for history
- Unprefixed search queries match across all categories
- Fuzzy matching, most-recent-first ranking

### History Timeline
- Logs all tool transformations automatically
- Stored in right drawer under History tab
- Each entry: tool name, input preview, output preview, timestamp
- Actions: re-run, copy output, promote to snippet, send to tool

### Cross-Tool Flow
- Right-click or Cmd/Ctrl+Shift+T on any output: "Send to [tool]" menu
- Content passed as input to target tool
- Replaces manual copy-paste between tools

### File I/O
- Drag-and-drop files onto any tool — auto-detect content type, load as input
- Cmd/Ctrl+O: open file dialog, load into current tool
- Cmd/Ctrl+S: save current output to disk

### State Persistence
- Each tool's state (input, output, selected sub-mode) persisted in memory across tool switches
- Last 10 inputs per tool retained in SQLite
- Full session restored on app restart (active tool, drawer state, window position/size)

### Settings (Cmd/Ctrl+,)
- Theme: dark / light
- Editor font size
- Indent size per language
- Default timezone (for timestamp converter)
- Monaco keybinding mode: standard / vim / emacs
- Always-on-top default
- Global hotkey customization

### Window Behavior
- Remember position, size, active tool on restart
- Always-on-top toggle (title bar button + Cmd/Ctrl+Shift+P)
- Multi-monitor aware

---

## 8. Architecture

### Stack

| Layer | Technology |
|---|---|
| Shell | Tauri 2 (Rust backend, WebView frontend) |
| Frontend | React + TypeScript |
| State | Zustand (UI state with SQLite persistence) |
| Editor | Monaco Editor (all code surfaces) |
| Storage | SQLite via tauri-plugin-sql |
| File I/O | Tauri filesystem API |
| Heavy Ops | Web Workers (formatting, diffing, AST transforms, XML parsing) |
| Multi-Window | Tauri multi-window API (pop-out notes) |
| Global Hotkey | Tauri global-shortcut API |

### Key Libraries

| Purpose | Library |
|---|---|
| Formatting | prettier (+ prettier-plugin-sql) |
| Diffing | diff / diff2html |
| Markdown render (split mode) | marked |
| Markdown WYSIWYG (inline mode) | milkdown |
| Mermaid diagrams | mermaid |
| Fuzzy search | fuse.js |
| XML parsing | @xmldom/xmldom |
| TypeScript transpile | typescript (compiler API) |
| CSS/HTML validation | css-tree, htmlhint |
| Tailwind conversion | css-to-tailwindcss (or custom mapping table) |
| AST transforms | recast + ast-types (browser-compatible; jscodeshift's underlying libs) |
| JWT decode | jose (decode only) |
| Hashing | Web Crypto API (native, no library) |
| Regex | Native JS RegExp + highlight logic |

### Processing Model

All CPU-intensive operations run in Web Workers to maintain <50ms UI responsiveness:
- **Format Worker:** Prettier formatting for all languages
- **Diff Worker:** Diff computation and patch generation
- **Transform Worker:** AST-based refactoring via recast + ast-types
- **Parse Worker:** XML validation, CSS validation, HTML validation

Lightweight operations (Base64, URL encode, case conversion, UUID, hashing) run on the main thread — they complete in <1ms.

### Data Model

```sql
-- SQLite Schema

CREATE TABLE snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_snippets_updated ON snippets(updated_at);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'default',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_pinned ON notes(pinned, updated_at);

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  sub_mode TEXT NOT NULL DEFAULT '',
  input TEXT NOT NULL,       -- max 10KB
  output TEXT NOT NULL,      -- max 10KB
  timestamp INTEGER NOT NULL
);
CREATE INDEX idx_history_timestamp ON history(timestamp);
-- Auto-prune: max 1000 rows, delete oldest on insert

CREATE TABLE tool_state (
  tool_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,       -- JSON blob
  updated_at INTEGER NOT NULL
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL         -- JSON blob
);
```

TypeScript interfaces for application code:

```typescript
// SQLite tables

interface Snippet {
  id: string           // UUID
  title: string
  content: string
  language: string     // auto-detected or user-set
  tags: string[]       // stored as JSON array
  createdAt: number    // Unix ms
  updatedAt: number
}

interface Note {
  id: string
  title: string
  content: string      // Markdown
  color: string        // Card color label
  pinned: boolean
  createdAt: number
  updatedAt: number
}

interface HistoryItem {
  id: string
  tool: string         // Tool identifier
  subMode: string      // e.g., "lint", "format"
  input: string        // Truncated to 10KB max
  output: string       // Truncated to 10KB max
  timestamp: number
}
// History retention: max 1000 items, auto-prune oldest when exceeded

interface ToolState {
  toolId: string       // Primary key
  state: string        // JSON-serialized tool state
  updatedAt: number
}

interface AppSettings {
  key: string          // Primary key
  value: string        // JSON-serialized value
}
```

---

## 9. Performance Requirements

| Metric | Target |
|---|---|
| UI interaction latency | <50ms |
| Formatting (typical file) | <200ms |
| Diffing (typical file) | <200ms |
| Tool switch | <16ms (single frame) |
| App shell visible | <500ms |
| Active tool fully ready | <1.5s |
| Note quick capture to dismiss | <100ms |
| Search/filter response | <50ms |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cold start performance | Progressive loading: render app shell (sidebar + status bar) immediately, lazy-load the active tool's Monaco instance and workers on demand |
| Monaco memory with many tools | Lazy-load Monaco instances, destroy when tool is inactive, restore state from SQLite |
| Refactoring produces incorrect code | Always preview via diff, never auto-apply |
| 26 tools = cluttered sidebar | Collapsible groups, command palette as primary nav |
| Prettier/Workers bundle size | Code-split workers, lazy-load language parsers |
| Cross-platform keyboard inconsistency | Abstract shortcuts through Tauri's accelerator API (captures before WebView), test both platforms. Note: Ctrl+1/2/3 on Windows may conflict with some window managers — Tauri intercepts these at the app level |

---

## 11. Future Enhancements (Out of Scope)

- Smart refactor suggestions (AI-powered)
- Tool pipeline chaining (sequential transforms)
- Local AI assistance (local LLM integration)
- Plugin system for community tools
- Cloud sync for notes/snippets
- CSS gradient/shadow builders
- GraphQL explorer
- Bundle size analyzer
