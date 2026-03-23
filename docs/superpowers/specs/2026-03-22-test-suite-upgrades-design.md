# Test Suite Upgrades — Smoke Tests for All Tools

**Date:** 2026-03-22
**Branch:** `feat/test-upgrades`
**Goal:** Add render + basic interaction smoke tests for all 25 untested tools in the cockpit app.

## Context

The cockpit app has 27 tools and 52 tests across 8 files. Only 2 tools have any test coverage (regex-tester utility tests, case-converter component test). After a session rewriting 12 tools, we need regression coverage to catch render errors, broken state wiring, and UI interaction failures.

## Approach

**Individual test file per tool** — each tool gets its own `*.test.tsx` in `src/tools/__tests__/`. Follows existing convention. Each file has 3-5 tests covering: renders without crashing, accepts input, produces output, primary action works, mode/tab switching (where applicable).

**Shared test infrastructure** — Monaco mock, worker mocks, and a `renderTool()` helper to reduce boilerplate.

## Infrastructure Changes

### 1. Monaco Editor Mock (test-setup.ts)

Mock `@monaco-editor/react` globally:
- `Editor` renders a `<textarea>` with `data-testid="monaco-editor"` that calls `onChange` with the value. Respects `value`, `onChange`, `language` props.
- `DiffEditor` renders two read-only `<textarea>`s with `data-testid="monaco-diff-original"` and `data-testid="monaco-diff-modified"`.
- `loader` — mock `loader.init()` to resolve with `{ editor: { defineTheme: vi.fn(), setTheme: vi.fn() } }`. Required because `useMonacoTheme()` (used by 11 tools) calls `loader.init()` at render time.

### 2. Worker Mocks (test-setup.ts)

- Mock all `?worker` imports (Vite worker syntax) to return a no-op constructor
- Mock `@/hooks/useWorker` to return a proxy object where any method call resolves immediately with a sensible default (empty string)

### 3. Additional Library Mocks (test-setup.ts)

- `mermaid` — mock `render()` to return `{ svg: '<svg>mock</svg>' }`
- `diff2html` — mock `html()` to return `<div>mock diff</div>`
- `htmlhint` — mock dynamic `import('htmlhint')` to return `{ HTMLHint: { verify: vi.fn(() => []) } }`. Required because `HtmlValidator` uses a dynamic import at runtime.

### 4. Shared Test Helper (src/tools/__tests__/test-utils.ts)

```typescript
function renderTool(Component: React.ComponentType): ReturnType<typeof render>
```

- Resets `useToolStateCache` state
- Renders the component
- Returns the render result

## Test Files (25 new files)

Each file: `src/tools/__tests__/<tool-id>.test.tsx`

### Code Group
| File | Tests |
|------|-------|
| `code-formatter.test.tsx` | Renders, paste code, click Format, output updates |
| `ts-playground.test.tsx` | Renders, paste TS, transpile output appears |
| `diff-viewer.test.tsx` | Renders both editors, enter text in both, Compare button, diff output renders |
| `refactoring-toolkit.test.tsx` | Renders, paste code, toggle transform checkbox, preview updates |

### Data Group
| File | Tests |
|------|-------|
| `json-tools.test.tsx` | Renders, paste JSON, Format button, formatted output; Minify button; stats bar shows |
| `xml-tools.test.tsx` | Renders, paste XML, Format button, formatted output |
| `json-schema-validator.test.tsx` | Renders both editors, paste JSON + schema, validation result shows |

### Web Group
| File | Tests |
|------|-------|
| `css-validator.test.tsx` | Renders, paste CSS, validate, results appear |
| `html-validator.test.tsx` | Renders, paste HTML, validate, results appear |
| `css-specificity.test.tsx` | Renders, type selector, specificity score appears |
| `css-to-tailwind.test.tsx` | Renders, paste CSS, Tailwind output appears |

### Convert Group
| File | Tests |
|------|-------|
| `color-converter.test.tsx` | Renders, type hex value, RGB/HSL values appear |
| `timestamp-converter.test.tsx` | Renders, click "Now" preset, format rows appear; type timestamp, formats update |
| `base64.test.tsx` | Renders, type text, encoded output; toggle decode mode, swap works |
| `url-codec.test.tsx` | Renders, type text, encoded output; swap button works |
| `curl-to-fetch.test.tsx` | Renders, paste curl command, generated code appears; tab switching between fetch/axios/ky |
| `uuid-generator.test.tsx` | Renders, click Generate, UUID appears matching format regex |
| `hash-generator.test.tsx` | Renders, type text, hash values appear (MD5, SHA-256, etc.) |

### Test Group
| File | Tests |
|------|-------|
| `regex-tester-component.test.tsx` | Renders, type pattern + test string, match count shows, highlighted output; replace mode tab |
| `jwt-decoder.test.tsx` | Renders, paste valid JWT, header/payload/signature sections appear; expiry badge shows |

### Network Group
| File | Tests |
|------|-------|
| `api-client.test.tsx` | Renders, type URL, click Send, response panel shows status; tab switching (Params/Headers/Body) |
| `docs-browser.test.tsx` | Renders, search input present, frame container renders |

### Write Group
| File | Tests |
|------|-------|
| `markdown-editor.test.tsx` | Renders, type markdown, switch to preview tab, preview container renders |
| `mermaid-editor.test.tsx` | Renders, type mermaid syntax, render output appears |
| `snippets.test.tsx` | Renders, create snippet, snippet appears in list; delete with confirmation |

## Mocking Strategy for Special Cases

- **API Client** — configure `@tauri-apps/plugin-http` fetch mock to return `{ status: 200, statusText: 'OK', headers: new Headers(), text: () => '{}', ok: true }`
- **Docs Browser** — test render + search input only, no network
- **Mermaid Editor** — `mermaid.render()` returns stub SVG
- **Snippets Manager** — seed snippets store with test data
- **Markdown Editor** — test tab switching and container presence, not markdown rendering
- **Worker-dependent tools** (Diff Viewer, Code Formatter, TS Playground, XML Tools) — `useWorker` mock returns proxy that resolves with empty/default values
- **Main-thread validation tools** — CSS Validator uses `css-tree` directly (no mock needed, runs in jsdom). HTML Validator uses dynamic `import('htmlhint')` (mocked globally). CSS Specificity and CSS → Tailwind are pure synchronous computation (no mocks needed). JSON Schema Validator uses `ajv` + `ajv-formats` synchronously (no mock needed, runs in jsdom).

## Expected Outcome

- **25 new test files**, ~30-60 lines each
- **~125-150 new tests**, bringing total from 52 to ~175-200
- **All tests complete in <5 seconds** (jsdom + mocks)
- **Zero new dependencies**

## Out of Scope

- Coverage reporting configuration
- Store/hook unit tests
- End-to-end tests
- Accessibility tests
- Changes to existing test files
