# Markdown Editor Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4 static toolbar insertions (Link, Image, Code Block, Table) with interactive modals that guide the user through structured input before generating correct markdown.

**Architecture:** Four focused modal components in `apps/cockpit/src/tools/markdown-editor/modals/`. Each modal receives an `onInsert(text: string)` callback and `onClose()`. MarkdownEditor.tsx manages `activeModal` state and wires each toolbar button to open its modal; on confirm the modal calls `onInsert` which calls the existing `insertFormatting` helper with the fully-formed text.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS via CSS custom properties, shared `Button`/`Input` components, Phosphor icons, Vitest + Testing Library.

---

## File Map

| Action | File |
|--------|------|
| Create | `apps/cockpit/src/tools/markdown-editor/modals/LinkModal.tsx` |
| Create | `apps/cockpit/src/tools/markdown-editor/modals/CodeBlockModal.tsx` |
| Create | `apps/cockpit/src/tools/markdown-editor/modals/ImageModal.tsx` |
| Create | `apps/cockpit/src/tools/markdown-editor/modals/TableModal.tsx` |
| Modify | `apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx` |
| Modify | `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx` |

---

### Task 1: LinkModal

**Files:**
- Create: `apps/cockpit/src/tools/markdown-editor/modals/LinkModal.tsx`
- Test: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1: Write failing tests for link generation logic**

Add to `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
// ... existing imports ...
import { LinkModal } from '../markdown-editor/modals/LinkModal'

describe('LinkModal', () => {
  it('inserts basic markdown link', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('[My Link](https://example.com)')
  })

  it('includes title attribute when provided', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.change(screen.getByPlaceholderText('Tooltip text (optional)'), {
      target: { value: 'My Title' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('[My Link](https://example.com "My Title")')
  })

  it('inserts HTML anchor for open-in-new-tab', () => {
    const onInsert = vi.fn()
    render(<LinkModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Link text'), {
      target: { value: 'My Link' },
    })
    fireEvent.click(screen.getByLabelText('Open in new tab'))
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">My Link</a>'
    )
  })

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn()
    render(<LinkModal onInsert={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('Insert button is disabled when URL is empty', () => {
    render(<LinkModal onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Insert')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -30
```

Expected: FAIL — `LinkModal` not found.

- [ ] **Step 3: Implement LinkModal**

Create `apps/cockpit/src/tools/markdown-editor/modals/LinkModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

type Props = {
  initialText?: string
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function LinkModal({ initialText = '', onInsert, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState(initialText)
  const [title, setTitle] = useState('')
  const [newTab, setNewTab] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleInsert = () => {
    const trimUrl = url.trim()
    if (!trimUrl) return
    const linkText = text.trim() || trimUrl
    if (newTab) {
      onInsert(`<a href="${trimUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`)
    } else if (title.trim()) {
      onInsert(`[${linkText}](${trimUrl} "${title.trim()}")`)
    } else {
      onInsert(`[${linkText}](${trimUrl})`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleInsert()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[400px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Link</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">URL *</label>
            <Input
              ref={urlRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Link Text</label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Link text"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">
              Title (tooltip)
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tooltip text (optional)"
              size="md"
              disabled={newTab}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={newTab}
              onChange={(e) => setNewTab(e.target.checked)}
              aria-label="Open in new tab"
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              Open in new tab (inserts HTML)
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert} disabled={!url.trim()}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | grep -E "(PASS|FAIL|✓|×|LinkModal)"
```

Expected: All LinkModal tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/modals/LinkModal.tsx apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx
git commit -m "feat(markdown-editor): add link insertion modal"
```

---

### Task 2: CodeBlockModal

**Files:**
- Create: `apps/cockpit/src/tools/markdown-editor/modals/CodeBlockModal.tsx`
- Test: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`:

```tsx
import { CodeBlockModal } from '../markdown-editor/modals/CodeBlockModal'

describe('CodeBlockModal', () => {
  it('inserts fenced code block with selected language', () => {
    const onInsert = vi.fn()
    render(<CodeBlockModal onInsert={onInsert} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search languages…')
    fireEvent.change(input, { target: { value: 'type' } })
    fireEvent.click(screen.getByText('typescript'))
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('```typescript\ncode\n```')
  })

  it('inserts plain code block when no language selected', () => {
    const onInsert = vi.fn()
    render(<CodeBlockModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('```\ncode\n```')
  })

  it('filters language list by search query', () => {
    render(<CodeBlockModal onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search languages…'), {
      target: { value: 'py' },
    })
    expect(screen.getByText('python')).toBeInTheDocument()
    expect(screen.queryByText('javascript')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `CodeBlockModal` not found.

- [ ] **Step 3: Implement CodeBlockModal**

Create `apps/cockpit/src/tools/markdown-editor/modals/CodeBlockModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

const LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'php',
  'plaintext',
  'python',
  'ruby',
  'rust',
  'scala',
  'shell',
  'sql',
  'swift',
  'toml',
  'typescript',
  'xml',
  'yaml',
]

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function CodeBlockModal({ onInsert, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = query.trim()
    ? LANGUAGES.filter((l) => l.includes(query.toLowerCase().trim()))
    : LANGUAGES

  const handleInsert = () => {
    const lang = selected || ''
    onInsert(`\`\`\`${lang}\ncode\n\`\`\``)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-[340px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Code Block</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected('')
            }}
            placeholder="Search languages…"
            size="md"
          />
          <div className="h-[180px] overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No match</p>
            ) : (
              filtered.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setSelected(lang)}
                  className={`block w-full px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                    selected === lang
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {lang}
                </button>
              ))
            )}
          </div>
          {selected && (
            <p className="font-mono text-xs text-[var(--color-accent)]">Selected: {selected}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleInsert}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | grep -E "(PASS|FAIL|✓|×|CodeBlockModal)"
```

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/modals/CodeBlockModal.tsx apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx
git commit -m "feat(markdown-editor): add code block language picker modal"
```

---

### Task 3: TableModal

**Files:**
- Create: `apps/cockpit/src/tools/markdown-editor/modals/TableModal.tsx`
- Test: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`:

```tsx
import { TableModal } from '../markdown-editor/modals/TableModal'

describe('TableModal', () => {
  it('generates a 2×2 table by default configuration', () => {
    const onInsert = vi.fn()
    render(<TableModal onInsert={onInsert} onClose={vi.fn()} />)
    // Change rows to 2, cols to 2
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0]!, { target: { value: '2' } })
    fireEvent.change(inputs[1]!, { target: { value: '2' } })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '| Col 1 | Col 2 |\n|-------|-------|\n|  |  |\n|  |  |'
    )
  })

  it('generates a 3×3 table', () => {
    const onInsert = vi.fn()
    render(<TableModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith(
      '| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n|  |  |  |\n|  |  |  |\n|  |  |  |'
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `TableModal` not found.

- [ ] **Step 3: Implement TableModal**

Create `apps/cockpit/src/tools/markdown-editor/modals/TableModal.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/shared/Button'

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

function buildTable(rows: number, cols: number): string {
  const header = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ')
  const separator = Array.from({ length: cols }, () => '-------').join('|')
  const dataRow = Array.from({ length: cols }, () => ' ').join(' | ')
  const headerLine = `| ${header} |`
  const separatorLine = `|${separator}|`
  const dataLines = Array.from({ length: rows }, () => `| ${dataRow} |`)
  return [headerLine, separatorLine, ...dataLines].join('\n')
}

export function TableModal({ onInsert, onClose }: Props) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') onInsert(preview)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onInsert, rows, cols]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => buildTable(rows, cols), [rows, cols])

  const clamp = (v: number) => Math.max(1, Math.min(10, v))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Table</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex gap-6">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">
                Rows (1–10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={rows}
                onChange={(e) => setRows(clamp(parseInt(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">
                Columns (1–10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={cols}
                onChange={(e) => setCols(clamp(parseInt(e.target.value) || 1))}
                className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Preview</label>
            <pre className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-xs text-[var(--color-text)]">
              {preview}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onInsert(preview)}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | grep -E "(PASS|FAIL|✓|×|TableModal)"
```

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/modals/TableModal.tsx apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx
git commit -m "feat(markdown-editor): add visual table editor modal"
```

---

### Task 4: ImageModal

**Files:**
- Create: `apps/cockpit/src/tools/markdown-editor/modals/ImageModal.tsx`
- Test: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`:

```tsx
import { ImageModal } from '../markdown-editor/modals/ImageModal'

describe('ImageModal', () => {
  it('inserts image with alt text and URL', () => {
    const onInsert = vi.fn()
    render(<ImageModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    fireEvent.change(screen.getByPlaceholderText('Alt text'), {
      target: { value: 'My Image' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('![My Image](https://example.com/image.png)')
  })

  it('inserts image with empty alt text when not provided', () => {
    const onInsert = vi.fn()
    render(<ImageModal onInsert={onInsert} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    fireEvent.click(screen.getByText('Insert'))
    expect(onInsert).toHaveBeenCalledWith('![](https://example.com/image.png)')
  })

  it('Insert button is disabled when URL is empty', () => {
    render(<ImageModal onInsert={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Insert')).toBeDisabled()
  })

  it('shows image preview when valid URL is entered', () => {
    render(<ImageModal onInsert={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/image.png'), {
      target: { value: 'https://example.com/image.png' },
    })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.png')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `ImageModal` not found.

- [ ] **Step 3: Implement ImageModal**

Create `apps/cockpit/src/tools/markdown-editor/modals/ImageModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

type Props = {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export function ImageModal({ onInsert, onClose }: Props) {
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [pasteError, setPasteError] = useState('')
  const urlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    urlRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && url.trim()) {
      e.preventDefault()
      onInsert(`![${alt.trim()}](${url.trim()})`)
    }
  }

  const handlePaste = async () => {
    setPasteError('')
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'))
        if (imageType) {
          const blob = await item.getType(imageType)
          const reader = new FileReader()
          reader.onload = (e) => {
            setUrl(e.target?.result as string)
          }
          reader.readAsDataURL(blob)
          return
        }
      }
      setPasteError('No image found in clipboard.')
    } catch {
      setPasteError('Clipboard access denied.')
    }
  }

  const isValid = url.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[420px] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="font-mono text-sm text-[var(--color-text)]">Insert Image</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Image URL</label>
            <div className="flex gap-2">
              <Input
                ref={urlRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                size="md"
                className="flex-1"
              />
              <Button variant="secondary" size="sm" onClick={handlePaste} title="Paste image from clipboard">
                Paste
              </Button>
            </div>
            {pasteError && (
              <p className="font-mono text-xs text-[var(--color-error)]">{pasteError}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[var(--color-text-muted)]">Alt Text</label>
            <Input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Alt text"
              size="md"
            />
          </div>

          {isValid && (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[var(--color-text-muted)]">Preview</label>
              <div className="flex items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <img
                  src={url}
                  alt={alt || 'preview'}
                  className="max-h-[120px] max-w-full rounded object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onInsert(`![${alt.trim()}](${url.trim()})`)}
            disabled={!isValid}
          >
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | grep -E "(PASS|FAIL|✓|×|ImageModal)"
```

- [ ] **Step 5: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/modals/ImageModal.tsx apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx
git commit -m "feat(markdown-editor): add image URL dialog with clipboard paste"
```

---

### Task 5: Wire modals into MarkdownEditor

**Files:**
- Modify: `apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx`
- Test: `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`

- [ ] **Step 1: Write integration tests**

Append to `apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx`:

```tsx
describe('MarkdownEditor modal integration', () => {
  it('opens link modal when Link toolbar button clicked', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Link'))
    expect(screen.getByText('Insert Link')).toBeInTheDocument()
  })

  it('opens image modal when Image toolbar button clicked', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Image'))
    expect(screen.getByText('Insert Image')).toBeInTheDocument()
  })

  it('opens code block modal when Code Block toolbar button clicked', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Code Block'))
    expect(screen.getByText('Insert Code Block')).toBeInTheDocument()
  })

  it('opens table modal when Table toolbar button clicked', () => {
    renderTool(MarkdownEditor)
    fireEvent.click(screen.getByTitle('Table'))
    expect(screen.getByText('Insert Table')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -20
```

Expected: integration tests FAIL (modals not yet wired).

- [ ] **Step 3: Update MarkdownEditor.tsx**

In `MarkdownEditor.tsx`, make these changes:

**a) Add imports** (after existing imports):

```tsx
import { LinkModal } from './modals/LinkModal'
import { CodeBlockModal } from './modals/CodeBlockModal'
import { ImageModal } from './modals/ImageModal'
import { TableModal } from './modals/TableModal'
```

**b) Add `id` fields to special FORMATTING_ACTIONS entries.** Change the Link, Image, Code Block, and Table entries:

```tsx
{ label: '🔗', title: 'Link', prefix: '[', suffix: '](url)', placeholder: 'link text', modal: 'link' as const },
{ label: '📷', title: 'Image', prefix: '![', suffix: '](url)', placeholder: 'alt text', modal: 'image' as const },
// ...
{
  label: '```',
  title: 'Code Block',
  prefix: '```\n',
  suffix: '\n```',
  placeholder: 'code',
  line: true,
  modal: 'code' as const,
},
{
  label: '⊞',
  title: 'Table',
  prefix: '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| ',
  suffix: ' |  |  |',
  placeholder: 'cell',
  line: true,
  modal: 'table' as const,
},
```

**c) Add modal state** inside the component (after `showTemplates` state):

```tsx
const [activeModal, setActiveModal] = useState<'link' | 'image' | 'code' | 'table' | null>(null)
```

**d) Add `handleModalInsert`** (after `insertFormatting`):

```tsx
const handleModalInsert = useCallback(
  (text: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!model || !selection) return
    editor.executeEdits('modal-insert', [{ range: selection, text, forceMoveMarkers: true }])
    editor.focus()
    setActiveModal(null)
  },
  []
)
```

**e) Update the toolbar rendering** — replace the `FORMATTING_ACTIONS.map` block so that actions with a `modal` field open the modal instead of calling `insertFormatting`:

```tsx
{FORMATTING_ACTIONS.map((action) => (
  <button
    key={action.title}
    onClick={() => {
      if ('modal' in action && action.modal) {
        setActiveModal(action.modal)
      } else {
        insertFormatting(action.prefix, action.suffix, action.placeholder, action.line)
      }
    }}
    title={action.title}
    className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
  >
    {action.label}
  </button>
))}
```

**f) Add modal rendering** — just before the closing `</div>` of the component return:

```tsx
{activeModal === 'link' && (
  <LinkModal
    initialText=""
    onInsert={handleModalInsert}
    onClose={() => setActiveModal(null)}
  />
)}
{activeModal === 'image' && (
  <ImageModal
    onInsert={handleModalInsert}
    onClose={() => setActiveModal(null)}
  />
)}
{activeModal === 'code' && (
  <CodeBlockModal
    onInsert={handleModalInsert}
    onClose={() => setActiveModal(null)}
  />
)}
{activeModal === 'table' && (
  <TableModal
    onInsert={handleModalInsert}
    onClose={() => setActiveModal(null)}
  />
)}
```

**g) Update sanitizeSchema** to allow `target` and `rel` on `<a>` tags (for the "open in new tab" HTML output):

```tsx
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'target', 'rel'],
    code: [...(defaultSchema.attributes?.['code'] ?? []), 'className'],
    span: [...(defaultSchema.attributes?.['span'] ?? []), 'className'],
    input: [...(defaultSchema.attributes?.['input'] ?? []), 'type', 'checked', 'disabled'],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'input'],
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd apps/cockpit && bun run test --reporter=verbose src/tools/__tests__/markdown-editor.test.tsx 2>&1 | tail -40
```

Expected: All tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd apps/cockpit && bun run check-types 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/cockpit/src/tools/markdown-editor/MarkdownEditor.tsx apps/cockpit/src/tools/__tests__/markdown-editor.test.tsx
git commit -m "feat(markdown-editor): wire link/image/code/table modals into toolbar"
```

---

### Task 6: Final review, push, and PR

- [ ] **Step 1: Run full test suite one more time**

```bash
cd apps/cockpit && bun run test 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/markdown-editor-modals
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat(markdown-editor): add link, image, code block, and table insertion modals" \
  --body "$(cat <<'EOF'
## Summary

- **Link modal** — dialog with URL, link text, title attr, and open-in-new-tab checkbox; generates standard markdown or raw HTML `<a>` for new-tab links
- **Code block language picker** — searchable dropdown of 29 languages; inserts correct fenced code block
- **Image modal** — URL input with live preview, alt text field, and clipboard paste button (`Paste`) that reads image data from clipboard
- **Table modal** — row/column number inputs with live markdown preview; generates properly-formatted GFM table

All four replace the previous static-insert toolbar buttons. Modals follow existing `SaveRequestModal` patterns (overlay, shared `Button`/`Input` components, Escape closes, Enter submits where applicable). `sanitizeSchema` updated to allow `target`/`rel` on `<a>` tags so new-tab links render correctly.

## Test plan

- [ ] All unit tests pass (`bun run test` in `apps/cockpit`)
- [ ] TypeScript strict check passes (`bun run check-types`)
- [ ] Link modal: test URL-only, URL+text, URL+title, open-in-new-tab
- [ ] Code block modal: search filtering, language selection, plain block (no language)
- [ ] Image modal: URL input → preview renders, Paste button reads clipboard image
- [ ] Table modal: change rows/cols, verify preview updates, insert

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

