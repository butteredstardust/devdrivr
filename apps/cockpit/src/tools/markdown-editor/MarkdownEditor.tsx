import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

// Markdown pipeline imports
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'

// ─── Types ───────────────────────────────────────────────────────────

type MarkdownEditorState = {
  content: string
  mode: string
  showToc: boolean
}

type TocEntry = {
  level: number
  text: string
  id: string
}

type EditorInstance = Parameters<OnMount>[0]

// ─── Constants ───────────────────────────────────────────────────────

const MODES = [
  { id: 'split', label: 'Split' },
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
]

const WORDS_PER_MINUTE = 200

const TEMPLATES: { label: string; content: string }[] = [
  {
    label: 'README',
    content: `# Project Name

> Short description of what this project does.

## Getting Started

### Prerequisites

- Node.js 18+
- Bun

### Installation

\`\`\`bash
bun install
bun run dev
\`\`\`

## Usage

Describe how to use the project here.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/items | List all items |
| POST   | /api/items | Create an item |

## Contributing

1. Fork it
2. Create your feature branch (\`git checkout -b feat/amazing\`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
`,
  },
  {
    label: 'Blog Post',
    content: `# Title of the Post

*Published: ${new Date().toISOString().split('T')[0]}*

## Introduction

Hook the reader with a compelling opening paragraph.

## Main Point

Develop your argument here. Use examples:

> "A relevant quote that supports your point."

### Supporting Detail

- First reason
- Second reason
- Third reason

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Conclusion

Summarize the key takeaway and call to action.

---

*Thanks for reading! Follow me for more posts.*
`,
  },
  {
    label: 'Meeting Notes',
    content: `# Meeting Notes — ${new Date().toISOString().split('T')[0]}

**Attendees:** Alice, Bob, Charlie
**Facilitator:** Alice

## Agenda

1. Status updates
2. Blockers
3. Next steps

## Discussion

### Status Updates

- **Alice:** Completed the auth flow, PR open for review
- **Bob:** Working on database migration, ETA tomorrow
- **Charlie:** Researching caching strategy

### Blockers

- [ ] CI pipeline timing out on integration tests
- [ ] Waiting on design review for settings page

## Action Items

| Owner | Task | Due |
|-------|------|-----|
| Bob   | Fix CI timeout | EOD |
| Charlie | Share caching proposal | Thursday |
| Alice | Review Bob's migration PR | Tomorrow |

## Next Meeting

Same time next week.
`,
  },
  {
    label: 'Changelog',
    content: `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- New feature description

### Changed
- Updated behavior description

### Fixed
- Bug fix description

## [1.0.0] — ${new Date().toISOString().split('T')[0]}

### Added
- Initial release
- Core feature A
- Core feature B

### Security
- Dependency audit completed
`,
  },
]

const FORMATTING_ACTIONS = [
  { label: 'B', title: 'Bold (⌘B)', prefix: '**', suffix: '**', placeholder: 'bold text' },
  { label: 'I', title: 'Italic (⌘I)', prefix: '_', suffix: '_', placeholder: 'italic text' },
  { label: '~~', title: 'Strikethrough', prefix: '~~', suffix: '~~', placeholder: 'strikethrough' },
  { label: '`', title: 'Inline Code', prefix: '`', suffix: '`', placeholder: 'code' },
  { label: 'H1', title: 'Heading 1', prefix: '# ', suffix: '', placeholder: 'Heading', line: true },
  { label: 'H2', title: 'Heading 2', prefix: '## ', suffix: '', placeholder: 'Heading', line: true },
  { label: 'H3', title: 'Heading 3', prefix: '### ', suffix: '', placeholder: 'Heading', line: true },
  { label: '—', title: 'Horizontal Rule', prefix: '\n---\n', suffix: '', placeholder: '', line: true },
  { label: '🔗', title: 'Link', prefix: '[', suffix: '](url)', placeholder: 'link text' },
  { label: '📷', title: 'Image', prefix: '![', suffix: '](url)', placeholder: 'alt text' },
  { label: '•', title: 'Bullet List', prefix: '- ', suffix: '', placeholder: 'item', line: true },
  { label: '1.', title: 'Numbered List', prefix: '1. ', suffix: '', placeholder: 'item', line: true },
  { label: '☐', title: 'Task List', prefix: '- [ ] ', suffix: '', placeholder: 'task', line: true },
  { label: '>', title: 'Blockquote', prefix: '> ', suffix: '', placeholder: 'quote', line: true },
  {
    label: '```',
    title: 'Code Block',
    prefix: '```\n',
    suffix: '\n```',
    placeholder: 'code',
    line: true,
  },
  {
    label: '⊞',
    title: 'Table',
    prefix: '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| ',
    suffix: ' |  |  |',
    placeholder: 'cell',
    line: true,
  },
]

// ─── Processor ───────────────────────────────────────────────────────

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify, { allowDangerousHtml: true })

// ─── Helpers ─────────────────────────────────────────────────────────

function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = []
  const re = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const level = parseInt(match[1] as string, 10)
    const text = (match[2] as string).replace(/<[^>]+>/g, '')
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
    entries.push({ level, text, id })
  }
  return entries
}

function readingTime(words: number): string {
  const minutes = Math.ceil(words / WORDS_PER_MINUTE)
  return minutes <= 1 ? '< 1 min read' : `${minutes} min read`
}

// ─── Component ───────────────────────────────────────────────────────

export default function MarkdownEditor() {
  useMonacoTheme()
  const [state, updateState] = useToolState<MarkdownEditorState>('markdown-editor', {
    content: '',
    mode: 'split',
    showToc: false,
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  // ─── Editor mount ────────────────────────────────────────────────

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  // ─── Markdown → HTML (debounced 300ms) ───────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.content.trim()) {
        setHtml('')
        return
      }
      try {
        const result = await processor.process(state.content)
        setHtml(String(result))
      } catch (e) {
        setHtml(`<p style="color: var(--color-error)">Render error: ${(e as Error).message}</p>`)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  // ─── Mermaid diagrams ────────────────────────────────────────────

  useEffect(() => {
    if (!html || !previewRef.current) return
    const mermaidBlocks = previewRef.current.querySelectorAll('code.language-mermaid')
    if (mermaidBlocks.length === 0) return

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' })
      mermaidBlocks.forEach(async (block, i) => {
        const parent = block.parentElement
        if (!parent) return
        try {
          const { svg } = await mermaid.render(`mermaid-${i}`, block.textContent ?? '')
          const wrapper = document.createElement('div')
          wrapper.className = 'mermaid-diagram'
          wrapper.innerHTML = svg
          parent.replaceWith(wrapper)
        } catch {
          // Leave as code block on error
        }
      })
    })
  }, [html])

  // ─── Stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const text = state.content.trim()
    if (!text) return null
    const words = text.split(/\s+/).filter(Boolean).length
    const chars = state.content.length
    const lines = state.content.split('\n').length
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length
    return { words, chars, lines, paragraphs, readTime: readingTime(words) }
  }, [state.content])

  // ─── TOC ─────────────────────────────────────────────────────────

  const toc = useMemo(() => extractToc(html), [html])

  const scrollToHeading = useCallback(
    (id: string) => {
      if (!previewRef.current) return
      // Find the heading in the preview by matching text content
      const headings = previewRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const h of headings) {
        const hId = (h.textContent ?? '')
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
        if (hId === id) {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' })
          break
        }
      }
    },
    []
  )

  // ─── Formatting insertion ────────────────────────────────────────

  const insertFormatting = useCallback(
    (prefix: string, suffix: string, placeholder: string, lineStart?: boolean) => {
      const editor = editorRef.current
      if (!editor) return
      const model = editor.getModel()
      const selection = editor.getSelection()
      if (!model || !selection) return

      const selectedText = model.getValueInRange(selection)
      const text = selectedText || placeholder

      let insertText: string
      if (lineStart && !selectedText) {
        // Line-start formatting (headings, lists, quotes): ensure we start on a new line
        const lineContent = model.getLineContent(selection.startLineNumber)
        const needsNewline = lineContent.trim().length > 0 && selection.startColumn > 1
        insertText = (needsNewline ? '\n' : '') + prefix + text + suffix
      } else {
        insertText = prefix + text + suffix
      }

      editor.executeEdits('formatting', [
        { range: selection, text: insertText, forceMoveMarkers: true },
      ])

      // Select the placeholder if no text was selected
      if (!selectedText && placeholder) {
        const startPos = model.getPositionAt(
          model.getOffsetAt(selection.getStartPosition()) + prefix.length
        )
        const endPos = model.getPositionAt(
          model.getOffsetAt(selection.getStartPosition()) + prefix.length + placeholder.length
        )
        editor.setSelection({
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        })
      }

      editor.focus()
    },
    []
  )

  // ─── Keyboard shortcuts for formatting ───────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'b') {
        e.preventDefault()
        insertFormatting('**', '**', 'bold text')
      } else if (mod && e.key === 'i') {
        e.preventDefault()
        insertFormatting('_', '_', 'italic text')
      } else if (mod && e.key === 'k') {
        e.preventDefault()
        insertFormatting('[', '](url)', 'link text')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [insertFormatting])

  // ─── Export handlers ─────────────────────────────────────────────

  const handleExportHtml = useCallback(() => {
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Export</title>
<style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:0.9em}
pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
th{background:#f8f8f8}
blockquote{border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666}
img{max-width:100%}</style>
</head><body>${html}</body></html>`
    navigator.clipboard.writeText(fullHtml)
    setLastAction('HTML copied to clipboard', 'success')
  }, [html, setLastAction])

  const handleDownload = useCallback(
    (format: 'md' | 'html') => {
      const content =
        format === 'md'
          ? state.content
          : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Export</title></head><body>${html}</body></html>`
      const blob = new Blob([content], {
        type: format === 'md' ? 'text/markdown' : 'text/html',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `document.${format}`
      a.click()
      URL.revokeObjectURL(url)
      setLastAction(`Downloaded as .${format}`, 'success')
    },
    [state.content, html, setLastAction]
  )

  const handleTemplateSelect = useCallback(
    (content: string) => {
      updateState({ content })
      setShowTemplates(false)
      setLastAction('Template loaded', 'success')
    },
    [updateState, setLastAction]
  )

  // ─── Layout flags ────────────────────────────────────────────────

  const showEditor = state.mode === 'split' || state.mode === 'edit'
  const showPreview = state.mode === 'split' || state.mode === 'preview'

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2">
        <TabBar
          tabs={MODES}
          activeTab={state.mode}
          onTabChange={(id) => updateState({ mode: id })}
        />
        <div className="ml-auto flex items-center gap-3 py-2">
          {stats && (
            <span
              className="text-[10px] text-[var(--color-text-muted)]"
              title={`${stats.lines} lines · ${stats.paragraphs} paragraphs · ${stats.readTime}`}
            >
              {stats.words}w · {stats.chars}c · {stats.readTime}
            </span>
          )}
          {toc.length > 0 && (
            <button
              onClick={() => updateState({ showToc: !state.showToc })}
              className={`text-xs transition-colors ${state.showToc ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
              title="Table of Contents"
            >
              TOC
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Templates
            </button>
            {showTemplates && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => handleTemplateSelect(t.content)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => handleDownload('md')}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Download .md file"
          >
            ↓ MD
          </button>
          <button
            onClick={() => handleDownload('html')}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Download .html file"
          >
            ↓ HTML
          </button>
          <button
            onClick={handleExportHtml}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Export HTML
          </button>
          <CopyButton text={state.content} label="Copy MD" />
        </div>
      </div>

      {/* ─── Formatting Toolbar ─────────────────────────────────── */}
      {showEditor && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] px-2 py-1">
          {FORMATTING_ACTIONS.map((action) => (
            <button
              key={action.title}
              onClick={() =>
                insertFormatting(action.prefix, action.suffix, action.placeholder, action.line)
              }
              title={action.title}
              className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* TOC Sidebar */}
        {state.showToc && showPreview && toc.length > 0 && (
          <div className="w-48 shrink-0 overflow-auto border-r border-[var(--color-border)] p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Contents
            </div>
            {toc.map((entry, i) => (
              <button
                key={`${entry.id}-${i}`}
                onClick={() => scrollToHeading(entry.id)}
                className="block w-full truncate text-left text-[11px] leading-relaxed text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}
                title={entry.text}
              >
                {entry.text}
              </button>
            ))}
          </div>
        )}

        {/* Editor */}
        {showEditor && (
          <div
            className={`${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'}`}
          >
            <Editor
              language="markdown"
              value={state.content}
              onChange={(v) => updateState({ content: v ?? '' })}
              onMount={handleEditorMount}
              options={EDITOR_OPTIONS}
            />
          </div>
        )}

        {/* Preview */}
        {showPreview && (
          <div
            ref={previewRef}
            className={`${showEditor ? 'w-1/2' : 'w-full'} overflow-auto p-6`}
          >
            {html ? (
              <div
                className="prose prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_code]:rounded [&_code]:bg-[var(--color-surface)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:font-pixel [&_h1]:text-[var(--color-accent)] [&_h2]:font-pixel [&_h2]:text-[var(--color-accent)] [&_h3]:font-pixel [&_hr]:border-[var(--color-border)] [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--color-border)] [&_pre]:bg-[var(--color-surface)] [&_pre]:p-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-accent)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--color-text-muted)] [&_img]:max-w-full [&_img]:rounded [&_li]:marker:text-[var(--color-accent)] [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-[var(--color-accent)]"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                Start typing markdown in the editor...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
