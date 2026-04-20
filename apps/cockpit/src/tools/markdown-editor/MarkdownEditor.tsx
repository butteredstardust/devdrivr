import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { TabBar } from '@/components/shared/TabBar'
import { Button } from '@/components/shared/Button'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { useUiStore } from '@/stores/ui.store'
import { useDomSelectionToolbar } from '@/hooks/useDomSelectionToolbar'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { MarkdownPreview } from './MarkdownPreview'
import { useScrollSync } from './hooks/useScrollSync'
import { useImageDrop } from './hooks/useImageDrop'
import { LinkModal } from './modals/LinkModal'
import { CodeBlockModal } from './modals/CodeBlockModal'
import { ImageModal } from './modals/ImageModal'
import { TableModal } from './modals/TableModal'
import { nextHeadingId } from './heading-ids'
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CodeIcon,
  CopyIcon,
  ImageIcon,
  LinkIcon,
  QuotesIcon,
  TextBIcon,
  TextItalicIcon,
} from '@phosphor-icons/react'

// Markdown pipeline imports
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// ─── Types ───────────────────────────────────────────────────────────

type MarkdownEditorState = {
  content: string
  mode: string
  showToc: boolean
  scrollSync: boolean
}

type TocEntry = {
  level: number
  text: string
  id: string
}

type EditorInstance = Parameters<OnMount>[0]

type FormattingAction = {
  label: string
  title: string
  prefix: string
  suffix: string
  placeholder: string
  line?: boolean
  modal?: 'link' | 'image' | 'code' | 'table'
  group: number
  icon?: React.ComponentType<{ size?: number }>
}

// ─── Constants ───────────────────────────────────────────────────────

// Edit first — natural workflow order
const MODES = [
  { id: 'edit', label: 'Edit' },
  { id: 'split', label: 'Split' },
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
  return \\\`Hello, \\\${name}!\\\`
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

const FORMATTING_ACTIONS: FormattingAction[] = [
  // Group 1 — inline text formatting
  {
    label: 'B',
    title: 'Bold (⌘B)',
    prefix: '**',
    suffix: '**',
    placeholder: 'bold text',
    group: 1,
  },
  {
    label: 'I',
    title: 'Italic (⌘I)',
    prefix: '_',
    suffix: '_',
    placeholder: 'italic text',
    group: 1,
  },
  {
    label: '~~',
    title: 'Strikethrough',
    prefix: '~~',
    suffix: '~~',
    placeholder: 'strikethrough',
    group: 1,
  },
  { label: '`', title: 'Inline Code', prefix: '`', suffix: '`', placeholder: 'code', group: 1 },
  // Group 2 — headings
  {
    label: 'H1',
    title: 'Heading 1',
    prefix: '# ',
    suffix: '',
    placeholder: 'Heading',
    line: true,
    group: 2,
  },
  {
    label: 'H2',
    title: 'Heading 2',
    prefix: '## ',
    suffix: '',
    placeholder: 'Heading',
    line: true,
    group: 2,
  },
  {
    label: 'H3',
    title: 'Heading 3',
    prefix: '### ',
    suffix: '',
    placeholder: 'Heading',
    line: true,
    group: 2,
  },
  // Group 3 — structure / lists
  {
    label: '•',
    title: 'Bullet List',
    prefix: '- ',
    suffix: '',
    placeholder: 'item',
    line: true,
    group: 3,
  },
  {
    label: '1.',
    title: 'Numbered List',
    prefix: '1. ',
    suffix: '',
    placeholder: 'item',
    line: true,
    group: 3,
  },
  {
    label: '☐',
    title: 'Task List',
    prefix: '- [ ] ',
    suffix: '',
    placeholder: 'task',
    line: true,
    group: 3,
  },
  {
    label: '>',
    title: 'Blockquote',
    prefix: '> ',
    suffix: '',
    placeholder: 'quote',
    line: true,
    group: 3,
  },
  {
    label: '—',
    title: 'Horizontal Rule',
    prefix: '\n---\n',
    suffix: '',
    placeholder: '',
    line: true,
    group: 3,
  },
  // Group 4 — media / insertions
  {
    label: 'Link',
    title: 'Link',
    prefix: '[',
    suffix: '](url)',
    placeholder: 'link text',
    modal: 'link',
    group: 4,
    icon: LinkIcon,
  },
  {
    label: 'Image',
    title: 'Image',
    prefix: '![',
    suffix: '](url)',
    placeholder: 'alt text',
    modal: 'image',
    group: 4,
    icon: ImageIcon,
  },
  // Group 5 — code / data blocks
  {
    label: '```',
    title: 'Code Block',
    prefix: '```\n',
    suffix: '\n```',
    placeholder: 'code',
    line: true,
    modal: 'code',
    group: 5,
  },
  {
    label: '⊞',
    title: 'Table',
    prefix: '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| ',
    suffix: ' |  |  |',
    placeholder: 'cell',
    line: true,
    modal: 'table',
    group: 5,
  },
]

// ─── Export style constants ───────────────────────────────────────────

const BASE_EXPORT_STYLES =
  'body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}' +
  'code{background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:0.9em}' +
  'pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto}' +
  'pre code{background:none;padding:0}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}' +
  'th{background:#f8f8f8}blockquote{border-left:4px solid #ddd;margin:0;padding:0 16px;color:#666}img{max-width:100%}'

const PRINT_STYLES =
  '@media print{body{margin:0}}' + BASE_EXPORT_STYLES.replace('body{', 'body{color:#111;')

// ─── Processor ───────────────────────────────────────────────────────

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

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify)

// ─── Helpers ─────────────────────────────────────────────────────────

function extractToc(html: string): TocEntry[] {
  const entries: TocEntry[] = []
  const headingCounts = new Map<string, number>()
  const re = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const level = parseInt(match[1] as string, 10)
    const text = (match[2] as string).replace(/<[^>]+>/g, '')
    const id = nextHeadingId(text, headingCounts)
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
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<MarkdownEditorState>('markdown-editor', {
    content: '',
    mode: 'split',
    showToc: false,
    scrollSync: true,
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [activeModal, setActiveModal] = useState<'link' | 'image' | 'code' | 'table' | null>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  // ─── Hooks ────────────────────────────────────────────────────────

  const showEditor = state.mode === 'split' || state.mode === 'edit'
  const showPreview = state.mode === 'split' || state.mode === 'preview'

  useScrollSync(editorRef, previewRef, state.scrollSync && state.mode === 'split')
  const { isDraggingImage } = useImageDrop(editorRef, editorContainerRef)
  const editorSelectionToolbar = useMonacoSelectionToolbar(mountedEditor, showEditor, state.content)
  const previewSelectionToolbar = useDomSelectionToolbar(previewRef, showPreview)

  // ─── Editor mount ────────────────────────────────────────────────

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    setMountedEditor(editor)
  }, [])

  useEffect(() => {
    return () => {
      editorRef.current?.getModel()?.dispose()
    }
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
        const msg = (e as Error).message
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        setHtml(`<p style="color: var(--color-error)">Render error: ${msg}</p>`)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

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

  // ─── Outside-click dismiss for Templates & Export dropdowns ──────

  useEffect(() => {
    if (!showTemplates) return
    const handler = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setShowTemplates(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTemplates])

  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

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
      let extraOffset = 0
      if (lineStart && !selectedText) {
        const lineContent = model.getLineContent(selection.startLineNumber)
        const needsNewline = lineContent.trim().length > 0 && selection.startColumn > 1
        if (needsNewline) extraOffset = 1
        insertText = (needsNewline ? '\n' : '') + prefix + text + suffix
      } else {
        insertText = prefix + text + suffix
      }

      editor.executeEdits('formatting', [
        { range: selection, text: insertText, forceMoveMarkers: true },
      ])

      if (!selectedText && placeholder) {
        const baseOffset = model.getOffsetAt(selection.getStartPosition()) + extraOffset
        const startPos = model.getPositionAt(baseOffset + prefix.length)
        const endPos = model.getPositionAt(baseOffset + prefix.length + placeholder.length)
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

  const copySelection = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setLastAction('Selection copied to clipboard', 'success')
      } catch {
        setLastAction('Failed to copy selection', 'error')
      }
    },
    [setLastAction]
  )

  const copyPreviewQuote = useCallback(
    async (text: string) => {
      const quote = text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      try {
        await navigator.clipboard.writeText(quote)
        setLastAction('Quoted selection copied to clipboard', 'success')
      } catch {
        setLastAction('Failed to copy selection', 'error')
      }
    },
    [setLastAction]
  )

  const editorSelectionActions = useMemo(
    () => [
      {
        id: 'bold',
        label: 'Bold',
        icon: <TextBIcon size={14} weight="bold" />,
        onSelect: () => insertFormatting('**', '**', 'bold text'),
      },
      {
        id: 'italic',
        label: 'Italic',
        icon: <TextItalicIcon size={14} />,
        onSelect: () => insertFormatting('_', '_', 'italic text'),
      },
      {
        id: 'code',
        label: 'Inline code',
        icon: <CodeIcon size={14} />,
        onSelect: () => insertFormatting('`', '`', 'code'),
      },
      {
        id: 'quote',
        label: 'Quote',
        icon: <QuotesIcon size={14} />,
        onSelect: () => insertFormatting('> ', '', 'quote', true),
      },
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copySelection,
      },
    ],
    [copySelection, insertFormatting]
  )

  const previewSelectionActions = useMemo(
    () => [
      {
        id: 'copy',
        label: 'Copy selection',
        icon: <CopyIcon size={14} />,
        onSelect: copySelection,
      },
      {
        id: 'quote',
        label: 'Copy as quote',
        icon: <QuotesIcon size={14} />,
        onSelect: copyPreviewQuote,
      },
    ],
    [copyPreviewQuote, copySelection]
  )

  const handleModalInsert = useCallback((text: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!model || !selection) return
    editor.executeEdits('modal-insert', [{ range: selection, text, forceMoveMarkers: true }])
    editor.focus()
    setActiveModal(null)
  }, [])

  // ─── Keyboard shortcuts for formatting ───────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      if (!editorRef.current?.hasTextFocus()) return
      if (e.key === 'b') {
        e.preventDefault()
        insertFormatting('**', '**', 'bold text')
      } else if (e.key === 'i') {
        e.preventDefault()
        insertFormatting('_', '_', 'italic text')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [insertFormatting])

  // ─── Export handlers ─────────────────────────────────────────────

  const buildFullHtml = useCallback(
    (styles: string) =>
      `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Export</title>\n<style>${styles}</style>\n</head><body>${html}</body></html>`,
    [html]
  )

  const handleCopyHtml = useCallback(() => {
    navigator.clipboard.writeText(buildFullHtml(BASE_EXPORT_STYLES))
    setLastAction('HTML copied to clipboard', 'success')
    setShowExport(false)
  }, [buildFullHtml, setLastAction])

  const handleDownload = useCallback(
    (format: 'md' | 'html') => {
      const content = format === 'md' ? state.content : buildFullHtml(BASE_EXPORT_STYLES)
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
      setShowExport(false)
    },
    [buildFullHtml, state.content, setLastAction]
  )

  const handleExportPdf = useCallback(() => {
    const fullHtml = buildFullHtml(PRINT_STYLES)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px'
    document.body.appendChild(iframe)
    const iframeDoc = iframe.contentWindow?.document
    if (!iframeDoc) {
      document.body.removeChild(iframe)
      return
    }
    iframeDoc.open()
    iframeDoc.write(fullHtml)
    iframeDoc.close()
    const win = iframe.contentWindow
    if (!win) {
      document.body.removeChild(iframe)
      return
    }
    win.addEventListener('afterprint', () => document.body.removeChild(iframe), { once: true })
    win.focus()
    try {
      win.print()
    } catch {
      document.body.removeChild(iframe)
      return
    }
    setLastAction('Print dialog opened', 'success')
    setShowExport(false)
  }, [buildFullHtml, setLastAction])

  const handleTemplateSelect = useCallback(
    (content: string) => {
      updateState({ content })
      setShowTemplates(false)
      setLastAction('Template loaded', 'success')
    },
    [updateState, setLastAction]
  )

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-2">
        <TabBar
          tabs={MODES}
          activeTab={state.mode}
          onTabChange={(id) => updateState({ mode: id })}
          noBorder
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

          {/* Scroll sync toggle — icon button, split mode only */}
          {state.mode === 'split' && (
            <button
              onClick={() => updateState({ scrollSync: !state.scrollSync })}
              title={
                state.scrollSync
                  ? 'Scroll sync on (click to disable)'
                  : 'Scroll sync off (click to enable)'
              }
              className={`flex items-center justify-center rounded p-0.5 transition-colors ${
                state.scrollSync
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <ArrowsClockwiseIcon size={13} weight={state.scrollSync ? 'bold' : 'regular'} />
            </button>
          )}

          {toc.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateState({ showToc: !state.showToc })}
              className={
                state.showToc ? 'bg-[var(--color-surface-hover)] !text-[var(--color-accent)]' : ''
              }
              title="Table of Contents"
              aria-pressed={state.showToc}
            >
              TOC
            </Button>
          )}

          {/* Templates dropdown */}
          <div ref={templatesRef} className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
              className={
                showTemplates ? 'bg-[var(--color-surface-hover)] !text-[var(--color-accent)]' : ''
              }
              aria-expanded={showTemplates}
              aria-haspopup="menu"
            >
              Templates
            </Button>
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

          {/* Export dropdown — consolidates Copy MD, Copy HTML, Download .md/.html, Print/PDF */}
          <div ref={exportRef} className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowExport(!showExport)}
              className={`gap-1 ${showExport ? 'bg-[var(--color-surface-hover)] !text-[var(--color-accent)]' : ''}`}
              aria-expanded={showExport}
              aria-haspopup="menu"
            >
              Export
              <CaretDownIcon size={10} />
            </Button>
            {showExport && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(state.content)
                      .then(() => setLastAction('Markdown copied to clipboard', 'success'))
                      .catch(() => setLastAction('Failed to copy to clipboard', 'error'))
                    setShowExport(false)
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Copy Markdown
                </button>
                <button
                  onClick={handleCopyHtml}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Copy HTML
                </button>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <button
                  onClick={() => handleDownload('md')}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Download .md
                </button>
                <button
                  onClick={() => handleDownload('html')}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Download .html
                </button>
                <button
                  onClick={handleExportPdf}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  Print / PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Formatting Toolbar ─────────────────────────────────── */}
      {showEditor && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] px-2 py-1">
          {FORMATTING_ACTIONS.map((action, i) => {
            const prev = FORMATTING_ACTIONS[i - 1]
            const showSep = i > 0 && prev !== undefined && action.group !== prev.group
            const Icon = action.icon
            return (
              <Fragment key={action.title}>
                {showSep && (
                  <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--color-border)]" />
                )}
                <button
                  onClick={() => {
                    if ('modal' in action && action.modal) {
                      setActiveModal(action.modal)
                    } else {
                      insertFormatting(
                        action.prefix,
                        action.suffix,
                        action.placeholder,
                        action.line
                      )
                    }
                  }}
                  title={action.title}
                  className="flex items-center justify-center rounded px-1.5 py-0.5 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  {Icon ? <Icon size={12} /> : action.label}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* ─── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        {showEditor && (
          <div
            ref={editorContainerRef}
            className={`relative h-full min-h-0 overflow-hidden ${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'}`}
          >
            <Editor
              theme={monacoTheme}
              language="markdown"
              value={state.content}
              onChange={(v) => updateState({ content: v ?? '' })}
              onMount={handleEditorMount}
              options={monacoOptions}
            />
            {/* Image drop overlay */}
            {isDraggingImage && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface)]/80 backdrop-blur-sm">
                <div className="rounded-lg border-2 border-dashed border-[var(--color-accent)] px-6 py-4 text-sm text-[var(--color-accent)]">
                  Drop image to embed
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {showPreview && (
          <div className={showEditor ? 'w-1/2' : 'w-full'}>
            <MarkdownPreview ref={previewRef} html={html} showToc={state.showToc} toc={toc} />
          </div>
        )}
      </div>

      {activeModal === 'link' && (
        <LinkModal
          initialText=""
          onInsert={handleModalInsert}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'image' && (
        <ImageModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'code' && (
        <CodeBlockModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'table' && (
        <TableModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      <SelectionContextToolbar
        selection={editorSelectionToolbar.selection}
        actions={editorSelectionActions}
        onDismiss={editorSelectionToolbar.clearSelection}
      />
      <SelectionContextToolbar
        selection={editorSelectionToolbar.selection ? null : previewSelectionToolbar.selection}
        actions={previewSelectionActions}
        onDismiss={previewSelectionToolbar.clearSelection}
      />
    </div>
  )
}
