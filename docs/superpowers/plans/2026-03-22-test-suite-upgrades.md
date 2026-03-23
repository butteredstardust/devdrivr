# Test Suite Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add render + basic interaction smoke tests for all 25 untested tools, bringing coverage from 52 to ~175+ tests.

**Architecture:** Individual test files per tool in `src/tools/__tests__/`, shared test infrastructure (Monaco mock, worker mock, renderTool helper) in `test-setup.ts` and `test-utils.ts`. Each test file has 3-5 tests covering render, input, output, and primary action.

**Tech Stack:** Vitest, React Testing Library, jsdom, vi.mock for Monaco/workers/external libs

**Spec:** `docs/superpowers/specs/2026-03-22-test-suite-upgrades-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/test-setup.ts` | Add Monaco, worker, mermaid, diff2html, htmlhint mocks |
| Create | `src/tools/__tests__/test-utils.ts` | Shared `renderTool()` helper |
| Create | `src/tools/__tests__/uuid-generator.test.tsx` | UUID Generator smoke tests |
| Create | `src/tools/__tests__/color-converter.test.tsx` | Color Converter smoke tests |
| Create | `src/tools/__tests__/timestamp-converter.test.tsx` | Timestamp Converter smoke tests |
| Create | `src/tools/__tests__/base64.test.tsx` | Base64 smoke tests |
| Create | `src/tools/__tests__/url-codec.test.tsx` | URL Codec smoke tests |
| Create | `src/tools/__tests__/hash-generator.test.tsx` | Hash Generator smoke tests |
| Create | `src/tools/__tests__/jwt-decoder.test.tsx` | JWT Decoder smoke tests |
| Create | `src/tools/__tests__/curl-to-fetch.test.tsx` | cURL → Fetch smoke tests |
| Create | `src/tools/__tests__/css-specificity.test.tsx` | CSS Specificity smoke tests |
| Create | `src/tools/__tests__/css-to-tailwind.test.tsx` | CSS → Tailwind smoke tests |
| Create | `src/tools/__tests__/css-validator.test.tsx` | CSS Validator smoke tests |
| Create | `src/tools/__tests__/html-validator.test.tsx` | HTML Validator smoke tests |
| Create | `src/tools/__tests__/json-schema-validator.test.tsx` | JSON Schema Validator smoke tests |
| Create | `src/tools/__tests__/json-tools.test.tsx` | JSON Tools smoke tests |
| Create | `src/tools/__tests__/xml-tools.test.tsx` | XML Tools smoke tests |
| Create | `src/tools/__tests__/code-formatter.test.tsx` | Code Formatter smoke tests |
| Create | `src/tools/__tests__/ts-playground.test.tsx` | TS Playground smoke tests |
| Create | `src/tools/__tests__/diff-viewer.test.tsx` | Diff Viewer smoke tests |
| Create | `src/tools/__tests__/refactoring-toolkit.test.tsx` | Refactoring Toolkit smoke tests |
| Create | `src/tools/__tests__/regex-tester-component.test.tsx` | Regex Tester component smoke tests |
| Create | `src/tools/__tests__/api-client.test.tsx` | API Client smoke tests |
| Create | `src/tools/__tests__/docs-browser.test.tsx` | Docs Browser smoke tests |
| Create | `src/tools/__tests__/markdown-editor.test.tsx` | Markdown Editor smoke tests |
| Create | `src/tools/__tests__/mermaid-editor.test.tsx` | Mermaid Editor smoke tests |
| Create | `src/tools/__tests__/snippets.test.tsx` | Snippets Manager smoke tests |

---

## Task 1: Test Infrastructure — Mocks

**Files:**
- Modify: `apps/cockpit/src/test-setup.ts`

- [ ] **Step 1: Add Monaco Editor mock to test-setup.ts**

Add this block after the existing `vi.mock('@/lib/db', ...)` block:

```typescript
// Mock Monaco Editor — renders as textarea for testing
vi.mock('@monaco-editor/react', () => {
  const React = require('react')
  return {
    default: React.forwardRef(function MockEditor(
      props: { value?: string; onChange?: (v: string) => void; language?: string; options?: Record<string, unknown> },
      _ref: unknown
    ) {
      return React.createElement('textarea', {
        'data-testid': 'monaco-editor',
        'data-language': props.language,
        value: props.value ?? '',
        onChange: (e: { target: { value: string } }) => props.onChange?.(e.target.value),
      })
    }),
    DiffEditor: function MockDiffEditor(props: { original?: string; modified?: string }) {
      const React = require('react')
      return React.createElement('div', { 'data-testid': 'monaco-diff' },
        React.createElement('textarea', { 'data-testid': 'monaco-diff-original', value: props.original ?? '', readOnly: true }),
        React.createElement('textarea', { 'data-testid': 'monaco-diff-modified', value: props.modified ?? '', readOnly: true })
      )
    },
    loader: {
      init: vi.fn().mockResolvedValue({
        editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
      }),
    },
  }
})
```

- [ ] **Step 2: Add worker mocks to test-setup.ts**

```typescript
// Mock Vite ?worker imports — return no-op constructor
vi.mock('@/workers/diff.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/formatter.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/typescript.worker?worker', () => ({ default: vi.fn() }))
vi.mock('@/workers/xml.worker?worker', () => ({ default: vi.fn() }))

// Mock useWorker hook — return proxy where any method resolves with empty string
vi.mock('@/hooks/useWorker', () => ({
  useWorker: () =>
    new Proxy({}, { get: () => vi.fn().mockResolvedValue('') }),
}))
```

- [ ] **Step 3: Add library mocks to test-setup.ts**

```typescript
// Mock mermaid for MermaidEditor and MarkdownEditor
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">mock</svg>' }),
    parse: vi.fn().mockResolvedValue(true),
  },
}))

// Mock diff2html for DiffViewer
vi.mock('diff2html', () => ({
  html: vi.fn().mockReturnValue('<div data-testid="diff-output">mock diff</div>'),
}))

// Mock htmlhint for HtmlValidator
vi.mock('htmlhint', () => ({
  HTMLHint: { verify: vi.fn(() => []) },
}))
```

- [ ] **Step 4: Run existing tests to verify mocks don't break anything**

Run: `cd apps/cockpit && bun run test`
Expected: All 52 existing tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/test-setup.ts
git commit -m "test: add Monaco, worker, and library mocks to test-setup"
```

---

## Task 2: Test Infrastructure — Shared Helper

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/test-utils.ts`

- [ ] **Step 1: Create test-utils.ts**

```typescript
import { render } from '@testing-library/react'
import { useToolStateCache } from '@/stores/tool-state.store'
import type { ComponentType } from 'react'

export function renderTool(Component: ComponentType) {
  useToolStateCache.setState({ cache: new Map() })
  return render(<Component />)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/test-utils.ts
git commit -m "test: add shared renderTool helper"
```

---

## Task 3: Simple Convert Tools (no Monaco, no workers)

These tools use plain inputs/textareas and pure JS logic. Fastest to test.

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/uuid-generator.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/color-converter.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/timestamp-converter.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/base64.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/url-codec.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/hash-generator.test.tsx`

- [ ] **Step 1: Write uuid-generator.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import UuidGenerator from '../uuid-generator/UuidGenerator'

describe('UuidGenerator', () => {
  it('renders generate button', () => {
    renderTool(UuidGenerator)
    expect(screen.getByText('Generate UUID')).toBeInTheDocument()
  })

  it('generates a valid UUID on click', () => {
    renderTool(UuidGenerator)
    fireEvent.click(screen.getByText('Generate UUID'))
    const code = document.querySelector('code')
    expect(code?.textContent).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })

  it('validates a correct UUID', () => {
    renderTool(UuidGenerator)
    const input = screen.getByPlaceholderText(/paste a uuid/i)
    fireEvent.change(input, { target: { value: '550e8400-e29b-41d4-a716-446655440000' } })
    expect(screen.getByText(/valid uuid/i)).toBeInTheDocument()
  })

  it('rejects an invalid UUID', () => {
    renderTool(UuidGenerator)
    const input = screen.getByPlaceholderText(/paste a uuid/i)
    fireEvent.change(input, { target: { value: 'not-a-uuid' } })
    expect(screen.getByText(/not a valid/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write color-converter.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import ColorConverter from '../color-converter/ColorConverter'

describe('ColorConverter', () => {
  it('renders with default color', () => {
    renderTool(ColorConverter)
    expect(screen.getByDisplayValue('#39ff14')).toBeInTheDocument()
  })

  it('shows format outputs for a valid hex', () => {
    renderTool(ColorConverter)
    // Default #39ff14 should produce formats
    expect(screen.getByText('Hex')).toBeInTheDocument()
    expect(screen.getByText('RGB')).toBeInTheDocument()
    expect(screen.getByText('HSL')).toBeInTheDocument()
  })

  it('updates formats when input changes', () => {
    renderTool(ColorConverter)
    const input = screen.getByDisplayValue('#39ff14')
    fireEvent.change(input, { target: { value: '#ff0000' } })
    expect(screen.getByText(/rgb\(255/i)).toBeInTheDocument()
  })

  it('shows WCAG contrast section', () => {
    renderTool(ColorConverter)
    expect(screen.getByText(/contrast/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Write timestamp-converter.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import TimestampConverter from '../timestamp-converter/TimestampConverter'

describe('TimestampConverter', () => {
  it('renders preset buttons', () => {
    renderTool(TimestampConverter)
    expect(screen.getByText('Now')).toBeInTheDocument()
    expect(screen.getByText('+1h')).toBeInTheDocument()
    expect(screen.getByText('Epoch')).toBeInTheDocument()
  })

  it('shows format rows after clicking Now', () => {
    renderTool(TimestampConverter)
    fireEvent.click(screen.getByText('Now'))
    expect(screen.getByText('ISO 8601')).toBeInTheDocument()
    expect(screen.getByText('RFC 2822')).toBeInTheDocument()
    expect(screen.getByText(/Relative/)).toBeInTheDocument()
  })

  it('parses a unix timestamp', () => {
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)
    fireEvent.change(input, { target: { value: '0' } })
    expect(screen.getByText(/1970/)).toBeInTheDocument()
  })

  it('shows error for invalid input', () => {
    renderTool(TimestampConverter)
    const input = screen.getByPlaceholderText(/unix timestamp/i)
    fireEvent.change(input, { target: { value: 'not-a-date' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Write base64.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import Base64Tool from '../base64/Base64Tool'

describe('Base64Tool', () => {
  it('renders encode mode by default', () => {
    renderTool(Base64Tool)
    expect(screen.getByText('Encode →')).toBeInTheDocument()
  })

  it('encodes text to base64', () => {
    renderTool(Base64Tool)
    const input = screen.getByPlaceholderText(/enter text to encode/i)
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(screen.getByText('aGVsbG8=')).toBeInTheDocument()
  })

  it('toggles to decode mode', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByText('Encode →'))
    expect(screen.getByText('← Decode')).toBeInTheDocument()
  })

  it('decodes base64 to text', () => {
    renderTool(Base64Tool)
    fireEvent.click(screen.getByText('Encode →'))
    const input = screen.getByPlaceholderText(/enter base64/i)
    fireEvent.change(input, { target: { value: 'aGVsbG8=' } })
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Write url-codec.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import UrlCodec from '../url-codec/UrlCodec'

describe('UrlCodec', () => {
  it('renders encode mode by default', () => {
    renderTool(UrlCodec)
    expect(screen.getByText('Encode →')).toBeInTheDocument()
  })

  it('encodes special characters', () => {
    renderTool(UrlCodec)
    const input = screen.getByPlaceholderText(/enter text or url/i)
    fireEvent.change(input, { target: { value: 'hello world' } })
    expect(screen.getByText('hello%20world')).toBeInTheDocument()
  })

  it('shows URL parts for a valid URL', () => {
    renderTool(UrlCodec)
    const input = screen.getByPlaceholderText(/enter text or url/i)
    fireEvent.change(input, { target: { value: 'https://example.com/path?q=1' } })
    expect(screen.getByText('URL Parts')).toBeInTheDocument()
  })

  it('toggles to decode mode', () => {
    renderTool(UrlCodec)
    fireEvent.click(screen.getByText('Encode →'))
    expect(screen.getByText('← Decode')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Write hash-generator.test.tsx**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import HashGenerator from '../hash-generator/HashGenerator'

describe('HashGenerator', () => {
  it('renders input area', () => {
    renderTool(HashGenerator)
    expect(screen.getByPlaceholderText(/enter text to hash/i)).toBeInTheDocument()
  })

  it('shows hash values after typing', async () => {
    vi.useFakeTimers()
    renderTool(HashGenerator)
    const input = screen.getByPlaceholderText(/enter text to hash/i)
    fireEvent.change(input, { target: { value: 'test' } })
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await waitFor(() => {
      expect(screen.getByText('MD5')).toBeInTheDocument()
      expect(screen.getByText('SHA-256')).toBeInTheDocument()
    })
  })

  it('shows placeholder when input is empty', () => {
    renderTool(HashGenerator)
    expect(screen.getByText(/enter text above to see hashes/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run tests**

Run: `cd apps/cockpit && bun run test`
Expected: All new tests + existing 52 pass

- [ ] **Step 8: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/uuid-generator.test.tsx \
  apps/cockpit/src/tools/__tests__/color-converter.test.tsx \
  apps/cockpit/src/tools/__tests__/timestamp-converter.test.tsx \
  apps/cockpit/src/tools/__tests__/base64.test.tsx \
  apps/cockpit/src/tools/__tests__/url-codec.test.tsx \
  apps/cockpit/src/tools/__tests__/hash-generator.test.tsx
git commit -m "test: add smoke tests for 6 convert tools"
```

---

## Task 4: Text-Based Tools (no Monaco, no workers)

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/jwt-decoder.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/regex-tester-component.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/css-specificity.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/curl-to-fetch.test.tsx`

- [ ] **Step 1: Write jwt-decoder.test.tsx**

Use this test JWT (valid structure, expired):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import JwtDecoder from '../jwt-decoder/JwtDecoder'

const TEST_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('JwtDecoder', () => {
  it('renders input area', () => {
    renderTool(JwtDecoder)
    expect(screen.getByPlaceholderText(/paste a jwt/i)).toBeInTheDocument()
  })

  it('decodes a valid JWT', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: TEST_JWT } })
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Payload Claims')).toBeInTheDocument()
    expect(screen.getByText('Signature')).toBeInTheDocument()
  })

  it('shows expiry badge for expired token', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: TEST_JWT } })
    expect(screen.getByText(/expired/i)).toBeInTheDocument()
  })

  it('shows error for invalid token', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: 'not.a.jwt' } })
    expect(screen.getByText(/invalid jwt/i)).toBeInTheDocument()
  })

  it('annotates known claims', () => {
    renderTool(JwtDecoder)
    fireEvent.change(screen.getByPlaceholderText(/paste a jwt/i), { target: { value: TEST_JWT } })
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText('Expiration')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write regex-tester-component.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import RegexTester from '../regex-tester/RegexTester'

describe('RegexTester (component)', () => {
  it('renders pattern input and test string area', () => {
    renderTool(RegexTester)
    expect(screen.getByPlaceholderText(/enter regex pattern/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter text to test/i)).toBeInTheDocument()
  })

  it('shows match count when pattern matches', () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), { target: { value: '\\d+' } })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), { target: { value: 'abc 123 def 456' } })
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows match and replace tabs', () => {
    renderTool(RegexTester)
    expect(screen.getByText('Match')).toBeInTheDocument()
    expect(screen.getByText('Replace')).toBeInTheDocument()
  })

  it('switches to replace mode', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    expect(screen.getByPlaceholderText(/replacement pattern/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Write css-specificity.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssSpecificity from '../css-specificity/CssSpecificity'

describe('CssSpecificity', () => {
  it('renders input area', () => {
    renderTool(CssSpecificity)
    expect(screen.getByPlaceholderText(/main.*content/i)).toBeInTheDocument()
  })

  it('calculates specificity for a selector', () => {
    renderTool(CssSpecificity)
    const input = screen.getByPlaceholderText(/main.*content/i)
    fireEvent.change(input, { target: { value: '#id .class p' } })
    expect(screen.getByText(/1 selector/i)).toBeInTheDocument()
  })

  it('handles multiple selectors', () => {
    renderTool(CssSpecificity)
    const input = screen.getByPlaceholderText(/main.*content/i)
    fireEvent.change(input, { target: { value: '#id\n.class\np' } })
    expect(screen.getByText(/3 selector/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Write curl-to-fetch.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CurlToFetch from '../curl-to-fetch/CurlToFetch'

describe('CurlToFetch', () => {
  it('renders input and output areas', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('cURL Command')).toBeInTheDocument()
  })

  it('shows output tabs', () => {
    renderTool(CurlToFetch)
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('axios')).toBeInTheDocument()
    expect(screen.getByText('ky')).toBeInTheDocument()
    expect(screen.getByText('XHR')).toBeInTheDocument()
    expect(screen.getByText('Node.js')).toBeInTheDocument()
  })

  it('converts a simple curl command', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: "curl 'https://api.example.com/data'" } })
    // Should show parsed summary with GET badge
    expect(screen.getByText('GET')).toBeInTheDocument()
  })

  it('shows error for invalid input', () => {
    renderTool(CurlToFetch)
    const input = screen.getByPlaceholderText(/curl/i)
    fireEvent.change(input, { target: { value: 'not a curl command' } })
    expect(screen.getByText(/could not parse/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd apps/cockpit && bun run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/jwt-decoder.test.tsx \
  apps/cockpit/src/tools/__tests__/regex-tester-component.test.tsx \
  apps/cockpit/src/tools/__tests__/css-specificity.test.tsx \
  apps/cockpit/src/tools/__tests__/curl-to-fetch.test.tsx
git commit -m "test: add smoke tests for JWT, Regex, CSS Specificity, cURL tools"
```

---

## Task 5: Monaco-Based Tools (no workers)

These use Monaco Editor (mocked as textarea) but no workers.

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/css-to-tailwind.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/css-validator.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/html-validator.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/json-schema-validator.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/json-tools.test.tsx`

- [ ] **Step 1: Write css-to-tailwind.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssToTailwind from '../css-to-tailwind/CssToTailwind'

describe('CssToTailwind', () => {
  it('renders editor and output panel', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('CSS Input')).toBeInTheDocument()
    expect(screen.getByText('Tailwind Output')).toBeInTheDocument()
  })

  it('converts CSS to Tailwind classes', () => {
    renderTool(CssToTailwind)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'display: flex;\npadding: 1rem;' } })
    expect(screen.getByText(/flex/)).toBeInTheDocument()
  })

  it('shows empty state when no input', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText(/enter css on the left/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write css-validator.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssValidator from '../css-validator/CssValidator'

describe('CssValidator', () => {
  it('renders editor', () => {
    renderTool(CssValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('validates correct CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { color: red; }' } })
    await waitFor(() => {
      expect(screen.getByText(/valid css/i)).toBeInTheDocument()
    })
  })

  it('shows errors for invalid CSS', async () => {
    renderTool(CssValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'body { color: ; }' } })
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Write html-validator.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import HtmlValidator from '../html-validator/HtmlValidator'

describe('HtmlValidator', () => {
  it('renders editor', () => {
    renderTool(HtmlValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('validates correct HTML', async () => {
    renderTool(HtmlValidator)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '<div>hello</div>' } })
    await waitFor(() => {
      expect(screen.getByText(/valid html/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 4: Write json-schema-validator.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import JsonSchemaValidator from '../json-schema-validator/JsonSchemaValidator'

describe('JsonSchemaValidator', () => {
  it('renders both editors', () => {
    renderTool(JsonSchemaValidator)
    expect(screen.getByText('JSON Data')).toBeInTheDocument()
    expect(screen.getByText('JSON Schema')).toBeInTheDocument()
  })

  it('shows validation result for valid data', async () => {
    renderTool(JsonSchemaValidator)
    const editors = screen.getAllByTestId('monaco-editor')
    // JSON data editor
    fireEvent.change(editors[0]!, { target: { value: '{"name": "test"}' } })
    // Schema editor — use a basic schema
    fireEvent.change(editors[1]!, {
      target: { value: '{"type": "object", "properties": {"name": {"type": "string"}}}' },
    })
    await waitFor(() => {
      expect(screen.getByText(/valid/i)).toBeInTheDocument()
    })
  })

  it('shows template buttons', () => {
    renderTool(JsonSchemaValidator)
    expect(screen.getByText(/basic/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Write json-tools.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import JsonTools from '../json-tools/JsonTools'

describe('JsonTools', () => {
  it('renders editor', () => {
    renderTool(JsonTools)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows format button', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Format')).toBeInTheDocument()
  })

  it('shows minify button', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Minify')).toBeInTheDocument()
  })

  it('shows stats for valid JSON', () => {
    renderTool(JsonTools)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: '{"a": 1, "b": 2}' } })
    expect(screen.getByText(/keys/i)).toBeInTheDocument()
  })

  it('shows tab bar with view modes', () => {
    renderTool(JsonTools)
    expect(screen.getByText('Tree')).toBeInTheDocument()
    expect(screen.getByText('Table')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `cd apps/cockpit && bun run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/css-to-tailwind.test.tsx \
  apps/cockpit/src/tools/__tests__/css-validator.test.tsx \
  apps/cockpit/src/tools/__tests__/html-validator.test.tsx \
  apps/cockpit/src/tools/__tests__/json-schema-validator.test.tsx \
  apps/cockpit/src/tools/__tests__/json-tools.test.tsx
git commit -m "test: add smoke tests for CSS, HTML, JSON Schema, JSON Tools"
```

---

## Task 6: Worker-Based Tools

These tools use the `useWorker` hook (mocked to return empty strings).

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/xml-tools.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/code-formatter.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/ts-playground.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/diff-viewer.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.tsx`

- [ ] **Step 1: Write xml-tools.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import XmlTools from '../xml-tools/XmlTools'

describe('XmlTools', () => {
  it('renders tab bar', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Lint & Format')).toBeInTheDocument()
    expect(screen.getByText('Tree View')).toBeInTheDocument()
    expect(screen.getByText('XPath')).toBeInTheDocument()
  })

  it('renders editor in Lint tab', () => {
    renderTool(XmlTools)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows Format and Validate buttons', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Validate')).toBeInTheDocument()
  })

  it('switches to XPath tab', () => {
    renderTool(XmlTools)
    fireEvent.click(screen.getByText('XPath'))
    expect(screen.getByPlaceholderText(/xpath/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write code-formatter.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import CodeFormatter from '../code-formatter/CodeFormatter'

describe('CodeFormatter', () => {
  it('renders format button', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Format')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(CodeFormatter)
    expect(screen.getByDisplayValue(/javascript/i)).toBeInTheDocument()
  })

  it('renders editor', () => {
    renderTool(CodeFormatter)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows formatting options', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText(/single quotes/i)).toBeInTheDocument()
    expect(screen.getByText(/semicolons/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Write ts-playground.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import TsPlayground from '../ts-playground/TsPlayground'

describe('TsPlayground', () => {
  it('renders both editors', () => {
    renderTool(TsPlayground)
    const editors = screen.getAllByTestId('monaco-editor')
    expect(editors.length).toBeGreaterThanOrEqual(2)
  })

  it('renders target and module selects', () => {
    renderTool(TsPlayground)
    expect(screen.getByDisplayValue('ESNext')).toBeInTheDocument()
  })

  it('renders strict checkbox', () => {
    renderTool(TsPlayground)
    expect(screen.getByText(/strict/i)).toBeInTheDocument()
  })

  it('renders copy output button', () => {
    renderTool(TsPlayground)
    expect(screen.getByText('Copy Output')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Write diff-viewer.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import DiffViewer from '../diff-viewer/DiffViewer'

describe('DiffViewer', () => {
  it('renders both editor panels', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Left (original)')).toBeInTheDocument()
    expect(screen.getByText('Right (modified)')).toBeInTheDocument()
  })

  it('renders compare button', () => {
    renderTool(DiffViewer)
    expect(screen.getByText('Compare')).toBeInTheDocument()
  })

  it('renders swap button', () => {
    renderTool(DiffViewer)
    expect(screen.getByText(/swap/i)).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(DiffViewer)
    expect(screen.getByDisplayValue('Plain Text')).toBeInTheDocument()
  })

  it('renders mode selector', () => {
    renderTool(DiffViewer)
    expect(screen.getByDisplayValue('Side by Side')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Write refactoring-toolkit.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import RefactoringToolkit from '../refactoring-toolkit/RefactoringToolkit'

describe('RefactoringToolkit', () => {
  it('renders editor', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('renders transform categories', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByText('Modernize')).toBeInTheDocument()
    expect(screen.getByText('Type Safety')).toBeInTheDocument()
    expect(screen.getByText('Cleanup')).toBeInTheDocument()
  })

  it('renders transform checkboxes', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByText('var → const')).toBeInTheDocument()
    expect(screen.getByText('Arrow functions')).toBeInTheDocument()
    expect(screen.getByText('== → ===')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByDisplayValue('JavaScript')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `cd apps/cockpit && bun run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/xml-tools.test.tsx \
  apps/cockpit/src/tools/__tests__/code-formatter.test.tsx \
  apps/cockpit/src/tools/__tests__/ts-playground.test.tsx \
  apps/cockpit/src/tools/__tests__/diff-viewer.test.tsx \
  apps/cockpit/src/tools/__tests__/refactoring-toolkit.test.tsx
git commit -m "test: add smoke tests for worker-based tools (XML, Formatter, TS, Diff, Refactoring)"
```

---

## Task 7: Network and Write Tools

**Files:**
- Create: `apps/cockpit/src/tools/__tests__/api-client.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/docs-browser.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/mermaid-editor.test.tsx`
- Create: `apps/cockpit/src/tools/__tests__/snippets.test.tsx`

- [ ] **Step 1: Write api-client.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import ApiClient from '../api-client/ApiClient'

describe('ApiClient', () => {
  it('renders URL input', () => {
    renderTool(ApiClient)
    expect(screen.getByPlaceholderText(/api\.example\.com/i)).toBeInTheDocument()
  })

  it('renders method selector', () => {
    renderTool(ApiClient)
    expect(screen.getByDisplayValue('GET')).toBeInTheDocument()
  })

  it('renders send button', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  it('renders request tabs', () => {
    renderTool(ApiClient)
    expect(screen.getByText('Params')).toBeInTheDocument()
    expect(screen.getByText('Headers')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write docs-browser.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import DocsBrowser from '../docs-browser/DocsBrowser'

describe('DocsBrowser', () => {
  it('renders DevDocs label', () => {
    renderTool(DocsBrowser)
    expect(screen.getByText(/devdocs/i)).toBeInTheDocument()
  })

  it('renders iframe', () => {
    renderTool(DocsBrowser)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Write markdown-editor.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import MarkdownEditor from '../markdown-editor/MarkdownEditor'

describe('MarkdownEditor', () => {
  it('renders tab bar', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('renders editor', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows word count stats', () => {
    renderTool(MarkdownEditor)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'hello world' } })
    expect(screen.getByText(/2w/)).toBeInTheDocument()
  })

  it('renders export and copy buttons', () => {
    renderTool(MarkdownEditor)
    expect(screen.getByText('Export HTML')).toBeInTheDocument()
    expect(screen.getByText('Copy MD')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Write mermaid-editor.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import MermaidEditor from '../mermaid-editor/MermaidEditor'

describe('MermaidEditor', () => {
  it('renders editor', () => {
    renderTool(MermaidEditor)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('renders template buttons', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('flowchart')).toBeInTheDocument()
    expect(screen.getByText('sequence')).toBeInTheDocument()
  })

  it('renders copy buttons', () => {
    renderTool(MermaidEditor)
    expect(screen.getByText('Copy SVG')).toBeInTheDocument()
    expect(screen.getByText('Copy PNG')).toBeInTheDocument()
    expect(screen.getByText('Copy Source')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Write snippets.test.tsx**

```tsx
import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '../snippets/SnippetsManager'

describe('SnippetsManager', () => {
  it('renders search input and new button', () => {
    renderTool(SnippetsManager)
    expect(screen.getByPlaceholderText(/search snippets/i)).toBeInTheDocument()
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('shows empty state when no snippets', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText(/no snippets yet/i)).toBeInTheDocument()
  })

  it('shows snippet when store has data', () => {
    useSnippetsStore.setState({
      snippets: [
        { id: '1', title: 'Test Snippet', content: 'console.log("hi")', language: 'javascript', tags: ['test'], createdAt: Date.now(), updatedAt: Date.now() },
      ],
      initialized: true,
    })
    renderTool(SnippetsManager)
    expect(screen.getByText('Test Snippet')).toBeInTheDocument()
  })

  it('renders export and import buttons', () => {
    renderTool(SnippetsManager)
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run all tests**

Run: `cd apps/cockpit && bun run test`
Expected: All tests pass (should be ~175+ total)

- [ ] **Step 7: Commit**

```bash
git add apps/cockpit/src/tools/__tests__/api-client.test.tsx \
  apps/cockpit/src/tools/__tests__/docs-browser.test.tsx \
  apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx \
  apps/cockpit/src/tools/__tests__/mermaid-editor.test.tsx \
  apps/cockpit/src/tools/__tests__/snippets.test.tsx
git commit -m "test: add smoke tests for API Client, Docs, Markdown, Mermaid, Snippets"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd apps/cockpit && bun run test`
Expected: All tests pass, total ~175+

- [ ] **Step 2: Run type check**

Run: `cd apps/cockpit && npx tsc --noEmit`
Expected: Clean compilation

- [ ] **Step 3: Verify test count**

Run: `cd apps/cockpit && bun run test 2>&1 | grep 'Tests'`
Expected: Shows total test count ≥ 150

- [ ] **Step 4: Commit any fixes if needed**

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/test-upgrades
```
