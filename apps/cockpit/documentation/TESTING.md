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
