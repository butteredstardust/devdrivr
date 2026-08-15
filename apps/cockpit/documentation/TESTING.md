# Testing Documentation and Best Practices

This document provides comprehensive guidelines for testing in the devdrivr cockpit application, including testing strategies, coverage, and how to add new tests.

## Overview

The devdrivr cockpit application uses Vitest with jsdom for testing. The testing strategy focuses on ensuring code quality and preventing regressions while maintaining a balance between comprehensive coverage and practical test maintenance.

## Current Test Coverage

The application currently has 593 tests across 74 test files, covering core stores, database and
migration contracts, worker RPC lifecycle behavior, shared utilities, shell components, and
tool-specific behavior. API Client coverage includes persistence CRUD, atomic imports, export/import
round trips, relationship preservation, and secret-redacted MCP serialization. MCP coverage includes
least-privilege defaults, lifecycle/settings rollback, non-blocking failures, loopback enforcement,
bearer-key rotation, and secret exposure controls.
Filesystem coverage includes dialog open/save success and cancellation, binary rejection, native
drop listeners, tool action dispatch, write failures, and image input/export errors.

## Testing Strategy

### Unit Testing Framework

- **Vitest 4** with **jsdom** for DOM simulation
- **@testing-library/react** for component testing
- **@testing-library/jest-dom** for enhanced DOM assertions

### Test Configuration

`vitest.config.ts`:

- Environment: `jsdom`
- Global APIs enabled (no need to import `describe`, `it`, `expect`)
- Setup file: `src/test-setup.ts` (loads `@testing-library/jest-dom` matchers)
- Path alias: `@/` → `src/`
- CSS disabled (avoids CSS variable resolution issues in jsdom)

## Representative Test Coverage Details

### `src/lib/__tests__/theme.test.ts` (4 tests)

Tests the `getEffectiveTheme()` utility in `src/lib/theme.ts`.

| Test                                                           | What it verifies            |
| -------------------------------------------------------------- | --------------------------- |
| Returns `dark` when theme is `dark`                            | Direct theme pass-through   |
| Returns `light` when theme is `light`                          | Direct theme pass-through   |
| Resolves `system` → `dark` when `prefers-color-scheme: dark`   | System preference detection |
| Resolves `system` → `light` when `prefers-color-scheme: light` | System preference detection |

### `src/lib/__tests__/keybindings.test.ts` (8 tests)

Tests `matchesCombo()` and `formatCombo()` in `src/lib/keybindings.ts`.

| Test                                     | What it verifies                        |
| ---------------------------------------- | --------------------------------------- |
| `matchesCombo` — simple mod+key          | Basic modifier + key matching           |
| `matchesCombo` — mod+shift+key           | Two-modifier combos                     |
| `matchesCombo` — rejects extra modifiers | No false positives from extra held keys |
| `matchesCombo` — mod+alt combinations    | Alt modifier support                    |
| `matchesCombo` — case insensitive key    | Key string normalisation                |
| `matchesCombo` — rejects wrong key       | Basic key mismatch                      |
| `formatCombo` — macOS symbol             | `⌘K` format                             |
| `formatCombo` — Windows text             | `Ctrl+K` format                         |

### `src/lib/__tests__/platform.test.ts` (7 tests)

Tests `detectPlatform()`, `getModKey()`, and `getModKeySymbol()` in `src/lib/platform.ts`.

| Test                                    | What it verifies       |
| --------------------------------------- | ---------------------- |
| Detects `mac` from user agent           | macOS detection        |
| Detects `windows` from user agent       | Windows detection      |
| Detects `linux` from user agent         | Linux detection        |
| `getModKey` → `'Cmd'` on mac            | Mac modifier label     |
| `getModKey` → `'Ctrl'` on windows       | Windows modifier label |
| `getModKeySymbol` → `'⌘'` on mac        | Mac symbol             |
| `getModKeySymbol` → `'Ctrl'` on windows | Windows symbol         |

### `src/lib/__tests__/tool-actions.test.ts` (5 tests)

Tests the pub/sub system in `src/lib/tool-actions.ts`.

| Test                             | What it verifies    |
| -------------------------------- | ------------------- |
| Dispatches action to subscriber  | Basic pub/sub       |
| Delivers to multiple subscribers | Fan-out delivery    |
| Does not call after unsubscribe  | Cleanup correctness |
| Passes action payload through    | Data integrity      |
| No error when no subscribers     | Safe empty dispatch |

### `src/app/__tests__/tool-registry.test.ts` (7 tests)

Tests the tool registry integrity in `src/app/tool-registry.ts`.

| Test                                                    | What it verifies          |
| ------------------------------------------------------- | ------------------------- |
| No duplicate tool IDs                                   | Registry uniqueness       |
| All tools have `id`, `label`, `group`, `component`      | Required field presence   |
| All tools belong to a known group                       | Group reference integrity |
| `getToolById` returns correct tool                      | Lookup by ID              |
| `getToolById` returns undefined for unknown ID          | Graceful miss             |
| `getToolsByGroup` returns tools for a group             | Group filter              |
| `getToolsByGroup` returns empty array for unknown group | Graceful empty            |

### `src/tools/__tests__/regex-tester.test.ts` (11 tests)

Tests pure utility functions exported from the RegexTester tool.

| Test                                                     | What it verifies           |
| -------------------------------------------------------- | -------------------------- |
| `escapeHtml` — escapes `<` and `>`                       | HTML bracket escaping      |
| `escapeHtml` — escapes `&`                               | Ampersand escaping         |
| `escapeHtml` — leaves plain text                         | No false escaping          |
| `highlightMatches` — wraps single match                  | Basic highlight            |
| `highlightMatches` — wraps multiple matches              | Multi-match                |
| `highlightMatches` — escapes HTML in input               | XSS safety                 |
| `highlightMatches` — escapes HTML in match               | XSS safety in matched span |
| `highlightMatches` — handles zero-width matches          | Edge case: `.*`            |
| `highlightMatches` — no match returns escaped input      | Miss case                  |
| `highlightMatches` — invalid regex returns escaped input | Graceful error             |

### `src/tools/__tests__/yaml-tools.test.tsx` (30 tests)

Covers the YAML helpers and the YAML Tools component.

| Test                                              | What it verifies                 |
| ------------------------------------------------- | -------------------------------- |
| `parseYamlStream` — empty vs invalid              | Empty input is not an error      |
| `parseYamlStream` — error location is 1-based     | Go to error lands on the problem |
| `parseYamlStream` — `---` stream                  | Multi-document support           |
| `stringifyYamlStream` — round trip                | A stream survives a reshape      |
| `hasUnpreservableSyntax` — comments and anchors   | Lossy-transform warning          |
| `documentsToJson` — single object vs array        | Stream shape in JSON             |
| `sortKeysDeep` — deep sort, array order preserved | Sort semantics                   |
| `parseYamlStream` / `jsonToYaml` — null document  | Null is a value, not a failure   |
| `stringifyYaml` — objects and sequences           | Serialisation                    |
| `jsonToYaml` — empty and malformed JSON           | Error messages name the problem  |
| Editor and inspector on screen together           | Panes replaced the old tabs      |
| Status line shape and document count              | Live validation                  |
| Parse error line/column + Go to error             | Error navigation                 |
| Format through the editor buffer                  | Formatter worker wiring          |
| Sort keys, then Undo                              | Reshape is recoverable           |
| Comment-dropping notice                           | No silent data loss              |
| JSON pane converts without a Convert click        | Live conversion                  |
| Apply to YAML, and refusal on invalid JSON        | JSON→YAML direction              |
| Invalid document explained in the tree pane       | No blank pane on a parse error   |
| Tree rows copyable by label                       | Keyboard reachability            |
| open-file / save-file, empty buffer refused       | Tool actions                     |
| Sample offered only while empty                   | Empty state                      |

### `src/tools/__tests__/json-schema-validator.test.tsx` (52 tests)

Covers the JSON Schema helpers and the JSON Schema Validator component.

| Test                                               | What it verifies                        |
| -------------------------------------------------- | --------------------------------------- |
| `parseJson` — line/column, blank input             | Parse errors are navigable              |
| `offsetToLocation` — 1-based, clamped              | Cursor math                             |
| `pointerLocation` — nested, root, `~0`/`~1`        | Ajv pointers map to the source text     |
| `pointerLocation` — braces inside strings, misses  | Scanner is not fooled; null on miss     |
| `pointerLocation` — duplicate keys pick the last   | Matches the value `JSON.parse` kept     |
| `validateJson` — draft 2019-09 and 2020-12         | Dialect chosen from `$schema`           |
| `validateJson` — data vs schema vs compile error   | The three failure modes stay apart      |
| `validateJson` — pointer, keyword, enum, extra     | Issue messages name the value           |
| `validateJson` — 500 errors capped at 200          | A huge array cannot flood the panel     |
| `validateJson` — strict mode, schema re-edit       | Strict wiring and Ajv cache eviction    |
| `inferSchema` — formats, required, item merge      | Inference reads every array item        |
| `inferSchema` — round-trips its own data           | An inferred schema accepts its input    |
| `generateSample` — every template, enum/format     | Samples validate against the schema     |
| Every template also passes under strict mode       | Strict never rejects our own starters   |
| Live region announces valid / N problems           | Verdict is announced, not shouted       |
| Problems list shows path and keyword               | Clickable navigation targets            |
| "The JSON data / schema does not parse"            | The user is told which side broke       |
| Template picker fills both editors on Load         | Templates                               |
| Selecting a template alone leaves buffers intact   | Arrow-key navigation is not destructive |
| Schema URL: loads, rejects non-http, names a       | Tauri HTTP client and its scope         |
| blocked host                                       |                                         |
| ⌘↵ revalidates and reports "Revalidated"           | The shortcut is observable              |
| save-file / copy-output use the focused pane       | Shell actions                           |
| Infer schema, then Undo; refusal on bad JSON       | Generators are recoverable              |
| Sample data validates; undo drops on manual edit   | No silent data loss                     |
| Format one pane leaves the other alone             | Per-pane actions                        |
| Strict toggle flips `aria-pressed` and the verdict | Strict mode                             |
| Problems panel hides and shows                     | Collapsible panel                       |
| Registry flags + open-file routing, undoable       | ⌘O/⌘S reach the tool; no data loss      |

### `src/tools/__tests__/csv-tools.test.tsx` (40 tests)

Covers the CSV helpers and the CSV Tools component.

| Test                                               | What it verifies                      |
| -------------------------------------------------- | ------------------------------------- |
| `detectDelimiter` — consistency across lines       | Commas inside a field no longer win   |
| `detectDelimiter` — quoted sections ignored        | `"x,y"` is one field                  |
| `parseCsv` — empty vs parsed                       | Untouched tool is not an error        |
| `parseCsv` — ragged row keeps its extra fields     | Papa's header mode dropped them       |
| `parseCsv` — issue carries the source line         | Go to issue lands on the row          |
| `parseCsv` — repeated and missing header names     | No column overwrites another          |
| `parseCsv` — typed off keeps `007` a string        | Codes survive the round trip          |
| `toOutput` — JSON rows/columns, TSV, Markdown, SQL | Every conversion format               |
| `toOutput` — pipes, quotes and newlines escaped    | Output cannot break its own syntax    |
| `parseCsv` — blank lines do not shift line numbers | Go to issue stays accurate            |
| `parseCsv` — newline inside a quoted field         | One record, not two                   |
| `parseCsv` — a quoted-empty line keeps alignment   | Papa skips it; the counter must too   |
| `detectDelimiter` — a title row does not mislead   | Agreement across records wins         |
| `toOutput` — SQL inserts name the file's table     | DDL and inserts must agree            |
| `summarizeColumns` — numeric and text statistics   | Min/max/mean/median, unique, mode     |
| `summarizeColumns` — one stray value is `mixed`    | A dirty column is not called numeric  |
| `countDuplicateRows`                               | Data-quality panel                    |
| `generateTypeScript` / `generateSql`               | Blanks nullable; identifiers quoted   |
| `outputFileName`                                   | An export never overwrites the source |
| Source editor and active pane on screen together   | Panes replaced the old tabs           |
| Status line: rows, columns, detected delimiter     | Live parse verdict                    |
| Ragged rows announced + Go to issue                | Error navigation                      |
| Load sample, then Undo                             | Buffer replacement is recoverable     |
| Table sorting from the keyboard + `aria-sort`      | Header was a click handler on `<th>`  |
| Table filter leaves the source untouched           | Preview is non-destructive            |
| Convert pane follows the format select             | Conversion wiring                     |
| Generated schema is shown, TypeScript and SQL      | It used to be copied but never shown  |
| Analysis panels open independently                 | The old accordion collapsed itself    |
| open-file names the buffer and is undoable         | No silent data loss                   |
| save-file saves the active view                    | ⌘S follows what is on screen          |
| copy-output copies the active view, or says why    | Async actions are explicit            |
| save-file inside the debounce window               | ⌘S writes the current buffer          |
| Table view saves the source verbatim               | Ragged rows and `007` survive         |
| Undo restores the file name too                    | ⌘S cannot overwrite the wrong file    |
| First paste recorded; flagged file recorded failed | History is not swallowed by the guard |

### `src/tools/__tests__/mermaid-editor.test.tsx` (39 tests)

Covers the Mermaid helpers, the editor shell, and the pan/zoom preview.

| Test                                                    | What it verifies                           |
| ------------------------------------------------------- | ------------------------------------------ |
| `detectDiagramType` skips `%%` comments/directives      | The type is read off the first real line   |
| `detectDiagramType` — unknown keyword, empty source     | Generic label, then null                   |
| `countStatements` ignores blanks and comments           | The status line counts real lines          |
| Every template resolves by id and parses                | The picker cannot offer a dead entry       |
| `parseMermaidError` — line number, caret block cut      | "Go to line" has something to jump to      |
| `parseMermaidError` — no line named                     | The jump button is omitted, not broken     |
| `sourceLineForReportedLine` maps through stripped lines | Mermaid parses a copy without comments     |
| `withSourceLine` rewrites the quoted line number        | Banner and jump button agree               |
| `svgSize` prefers `viewBox` over `max-width`            | `img.width` used to crop every PNG         |
| `svgSize` falls back to attributes, then a default      | No zero-sized export                       |
| `svgWithExplicitSize` pins px and strips max-width      | Copied SVG survives outside the app        |
| `fitScale` fits large, never enlarges small             | Fit-to-view                                |
| `exportFileName`                                        | `diagram.mmd` → `diagram.svg`              |
| Editor, mode control and diagram name on screen         | Shell layout                               |
| Status bar: type · lines · render state                 | Live verdict                               |
| Stale async renders ignored after rapid edits           | Render sequence guard                      |
| Light app theme initialises the light Mermaid theme     | Theme follows the app                      |
| `htmlLabels: false` on flowchart and class              | WebKit cannot rasterise `foreignObject`    |
| Rendered preview keeps pointer events                   | Diagram links stay clickable               |
| History recorded on edit, not on restored state         | Async hydration is not user input          |
| Error banner shows the line and keeps last diagram      | The preview no longer blanks mid-type      |
| Error line is the source line, not Mermaid's            | Comments shifted every reported line       |
| Scratch nodes removed after a failed render             | Mermaid leaked a `div#d<id>` per keystroke |
| No jump button when Mermaid names no line               | Nothing to jump to                         |
| Templates listed with human labels                      | `er`/`classDiagram` told nobody anything   |
| Template loads on a clean buffer, twice over            | Not "Modified", and no confirmation        |
| Template over unsaved work asks first                   | The old dropdown overwrote silently        |
| New diagram over unsaved work asks first                | No silent data loss                        |
| Registry flags for ⌘O/⌘S                                | The shortcuts reach the tool               |
| open-file then save-file round trip                     | File name and path are kept                |
| Toolbar Open marks the buffer saved                     | Modified/Saved status                      |
| Editing marks the buffer modified                       | Dirty tracking                             |
| Image actions disabled until something renders          | Nothing to export                          |
| Copy SVG pins pixel dimensions                          | Pasted SVG renders elsewhere               |
| copy-output copies the source                           | Shell action                               |
| PNG resolution and transparency appear for PNG          | Format-specific options                    |
| Preview zooms, pans and resets from the keyboard        | It was mouse-only                          |
| A user-set zoom survives a re-render                    | Auto-fit used to yank the view back        |
| Empty preview offers a template                         | Dead end replaced with an action           |

### `src/tools/__tests__/html-validator.test.tsx` (40 tests)

Covers the rule model, the document statistics, the outline and the editor shell.

| Test                                                | What it verifies                               |
| --------------------------------------------------- | ---------------------------------------------- |
| `buildRuleset` never passes a rule `false`          | Three rules looked enabled but never fired     |
| A rule with a mode is passed the mode               | `id-class-value` needs `'dash'`, not `true`    |
| Default-on off / default-off on                     | Both directions reach HTMLHint                 |
| Setting a rule back to its default drops it         | Overrides do not accumulate                    |
| `countRuleOverrides` counts departures only         | The badge on the Rules button                  |
| `isRuleEnabled` agrees with the built ruleset       | Panel and checker cannot disagree              |
| `sortIssues` puts errors first, then position       | The worst problem is the one on screen         |
| `countIssues` splits errors from warnings           | Status line arithmetic                         |
| `computeStats` discounts implied wrappers           | A pasted `<div>` is one element, not four      |
| `computeStats` counts declared wrappers             | A full document keeps `html`/`head`/`body`     |
| Depth measured from the tree                        | The old stack never popped `<li>`              |
| Heading text decoded and stripped of markup         | `Tips &amp; <em>tricks</em>` → `Tips & tricks` |
| Style attributes and scripts counted                | Footer statistics                              |
| `outlineProblems`: clean, no-h1 start, dupes, skips | Level gaps a linter will not report            |
| Every shipped template has a clean outline          | The starters practise what they check          |
| Editor and empty state render                       | Shell layout                                   |
| Problems listed with the rule that found them       | The rule id is the fix                         |
| Panel says "checking" before the first verdict      | It used to claim "No problems" first           |
| Previous problems survive the next run              | Rows no longer flicker away mid-click          |
| Clicking a problem in Preview returns to the source | The list was not clickable at all              |
| A rule switched on adds its problems                | Default-off rules now work                     |
| A rule switched off drops them; Reset restores      | Rules panel round trip                         |
| Outline lists headings and names skipped levels     | Accessibility of the document                  |
| Template over unsaved work asks first               | The old starters overwrote silently            |
| A freshly loaded template is not "Modified"         | No confirmation on the second load             |
| Sample loads from the empty state                   | Dead end replaced with an action               |
| Format runs through the formatter worker            | Shared prettier pipeline                       |
| Unparseable markup explains itself                  | Format failures were silent                    |
| Preview is sandboxed and debounced                  | Typing no longer reloads the frame             |
| Expand opens a focus-trapped dialog                 | The old overlay ate every Tab                  |
| open-file, toolbar Open, Save round trip            | ⌘O/⌘S reach the tool                           |
| Registry flags for ⌘O/⌘S                            | The shortcuts are wired up                     |
| History recorded on edit, not on restored state     | Async hydration is not user input              |
| A saved `'edit'` view mode still shows an editor    | The renamed mode used to render neither pane   |
| A restored document is not "Modified" until touched | State predating `savedContent` hydrates clean  |

### `src/stores/__tests__/notes.store.test.ts` (9 tests)

Tests the Zustand notes store in isolation (DB calls are mocked).

| Test                                     | What it verifies        |
| ---------------------------------------- | ----------------------- |
| Initial state is empty                   | Store initialises clean |
| `init()` is idempotent                   | Promise guard works     |
| `add()` creates note with generated ID   | nanoid usage            |
| `add()` defaults to correct color        | Default note color      |
| Notes ordered reverse-chronologically    | Sort order              |
| `update()` changes specified fields only | Partial update          |
| `update()` leaves other notes untouched  | Isolation               |
| `update()` with unknown ID is no-op      | Graceful miss           |
| `remove()` deletes the correct note      | Deletion                |

## What Is NOT Covered (Known Gaps)

| Area          | Gap                                                                      | Priority |
| ------------- | ------------------------------------------------------------------------ | -------- |
| Worker tools  | No full worker-thread integration tests for every worker-backed tool     | High     |
| DB helpers    | No native SQLite integration harness for executing migrations end-to-end | Medium   |
| Release smoke | Artifact-bound runtime reports remain manual on each supported platform  | Medium   |

## How to Add a Test

### Testing a Pure Utility Function

Create `src/lib/__tests__/my-util.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from '@/lib/my-util'

describe('myFunction', () => {
  it('returns expected value for input X', () => {
    expect(myFunction('X')).toBe('expected')
  })

  it('handles edge case Y gracefully', () => {
    expect(myFunction('')).toBe('')
  })
})
```

### Testing a Store (with DB Mocked)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB before importing the store
vi.mock('@/lib/db', () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  loadNotes: vi.fn().mockResolvedValue([]),
  saveNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}))

import { useMyStore } from '@/stores/my.store'

describe('myStore', () => {
  beforeEach(() => {
    useMyStore.setState({ items: [], initialized: false })
  })

  it('initial state is empty', () => {
    expect(useMyStore.getState().items).toEqual([])
  })
})
```

### Testing a React Component

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MyComponent from '@/components/shared/MyComponent'

describe('MyComponent', () => {
  it('renders label', () => {
    render(<MyComponent label="Hello" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('calls onChange when clicked', () => {
    const onChange = vi.fn()
    render(<MyComponent onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledOnce()
  })
})
```

### Testing a Worker (RPC Round-trip)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Workers in jsdom: use inline mock
const mockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((ev: MessageEvent) => void) | null,
  onerror: null,
}

vi.mock('@/workers/formatter.worker?worker', () => ({
  default: vi.fn(() => mockWorker),
}))
```

Note: Full worker round-trip tests are complex in jsdom. Prefer testing the pure API functions exported from the worker file directly (without `handleRpc`).

## Test File Locations

| Type            | Location                    | Pattern           |
| --------------- | --------------------------- | ----------------- |
| Library utils   | `src/lib/__tests__/`        | `*.test.ts`       |
| Store tests     | `src/stores/__tests__/`     | `*.store.test.ts` |
| Tool utils      | `src/tools/__tests__/`      | `*.test.ts`       |
| App-level       | `src/app/__tests__/`        | `*.test.ts`       |
| Component tests | `src/components/__tests__/` | `*.test.tsx`      |

## CI

GitHub Actions runs `.github/workflows/cockpit-ci.yml` on every PR, and on pushes to `main`, whenever
`apps/cockpit/**`, `bun.lock`, `package.json`, or the workflow itself changes. It has two jobs:

**`lint-and-test`** (ubuntu-latest)

1. Sets up Bun
2. `bun install` (repo root)
3. Security audit — `bun audit --audit-level=critical`, with waivers applied by `.github/scripts/waive-bun-audit.mjs`
4. `bun run lint`
5. `npx tsc --noEmit` (type check)
6. `bun run test` (must exit 0)

**`rust-check`** (ubuntu-22.04)

1. Installs the Rust stable toolchain and the GTK/WebKit system libraries Tauri needs
2. `cargo check` in `apps/cockpit/src-tauri`
3. `cargo clippy -- -D warnings` — any warning fails the build

A PR cannot be merged if either job fails. The full Vitest suite **must pass** before submitting any change.
