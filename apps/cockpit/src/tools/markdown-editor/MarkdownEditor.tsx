import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { SplitPane } from '@/components/shared/SplitPane'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { DocumentIdentity, DocumentToolbar, ToolbarGroup } from '@/components/shared/Toolbar'
import { useUiStore } from '@/stores/ui.store'
import { useToolAction } from '@/hooks/useToolAction'
import { useIsInstanceActive } from '@/app/tool-instance'
import {
  buildExportFilename,
  exportFile,
  filenameFromPath,
  openFileDialog,
  saveFileDialog,
  saveFileToPath,
} from '@/lib/file-io'
import { useDomSelectionToolbar } from '@/hooks/useDomSelectionToolbar'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'
import { MarkdownPreview } from '@/tools/markdown-editor/MarkdownPreview'
import { useScrollSync } from '@/tools/markdown-editor/hooks/useScrollSync'
import { useImageDrop } from '@/tools/markdown-editor/hooks/useImageDrop'
import { useMarkdownListEditing } from '@/tools/markdown-editor/hooks/useMarkdownListEditing'
import { useMarkdownSmartPaste } from '@/tools/markdown-editor/hooks/useMarkdownSmartPaste'
import { LinkModal } from '@/tools/markdown-editor/modals/LinkModal'
import { CodeBlockModal } from '@/tools/markdown-editor/modals/CodeBlockModal'
import { ImageModal } from '@/tools/markdown-editor/modals/ImageModal'
import { TableModal } from '@/tools/markdown-editor/modals/TableModal'
import { nextHeadingId } from '@/tools/markdown-editor/heading-ids'
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CodeIcon,
  CopyIcon,
  FilePlusIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  ImageIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  QuotesIcon,
  SwapIcon,
  TextBIcon,
  TextItalicIcon,
} from '@phosphor-icons/react'

// Shared markdown pipeline — see src/lib/markdown.ts for plugin order rationale.
// This tool renders through `markdownEditorProcessor`, which is identical to the
// Notes drawer's `markdownProcessor` except that GFM task-list checkboxes are left
// enabled (not `disabled`) so the preview can toggle them — see the sanitize schema
// comment in src/lib/markdown.ts for why that variant exists instead of loosening
// the shared schema for every surface.
import { markdownEditorProcessor } from '@/lib/markdown'
import { toggleTaskAtIndex } from '@/tools/markdown-editor/task-list'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useTabDirty } from '@/hooks/useTabDirty'
import { formatShortcut } from '@/lib/shortcut-label'

// ─── Types ───────────────────────────────────────────────────────────

type MarkdownEditorState = {
  content: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  mode: string
  showToc: boolean
  scrollSync: boolean
}

type TocEntry = {
  level: number
  text: string
  id: string
}

type PendingDocument = {
  content: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  successMessage: string
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

type EditorMode = 'edit' | 'split' | 'preview'

// Edit first — natural workflow order
const MODE_OPTIONS: { value: EditorMode; label: string }[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

const WORDS_PER_MINUTE = 200
const TEMPLATE_DATE = '{{current-date}}'

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

*Published: ${TEMPLATE_DATE}*

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
    content: `# Meeting Notes — ${TEMPLATE_DATE}

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

## [1.0.0] — ${TEMPLATE_DATE}

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
    title: `Bold (${formatShortcut('mod+b')})`,
    prefix: '**',
    suffix: '**',
    placeholder: 'bold text',
    group: 1,
  },
  {
    label: 'I',
    title: `Italic (${formatShortcut('mod+i')})`,
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
  ':root{' +
  '--export-bg:Canvas;' +
  '--export-text:CanvasText;' +
  '--export-muted:color-mix(in srgb, CanvasText 55%, Canvas 45%);' +
  '--export-border:color-mix(in srgb, CanvasText 18%, Canvas 82%);' +
  '--export-surface:color-mix(in srgb, Canvas 90%, CanvasText 10%);' +
  '--export-inverse-bg:color-mix(in srgb, CanvasText 88%, Canvas 12%);' +
  '--export-inverse-text:Canvas;' +
  '}' +
  'body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;background:var(--export-bg);color:var(--export-text)}' +
  'code{background:var(--export-surface);padding:2px 6px;border-radius:3px;font-size:0.9em}' +
  'pre{background:var(--export-inverse-bg);color:var(--export-inverse-text);padding:16px;border-radius:6px;overflow-x:auto}' +
  'pre code{background:none;padding:0}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--export-border);padding:8px 12px;text-align:left}' +
  'th{background:var(--export-surface)}blockquote{border-left:4px solid var(--export-border);margin:0;padding:0 16px;color:var(--export-muted)}img{max-width:100%}'

const PRINT_STYLES = '@media print{body{margin:0}}' + BASE_EXPORT_STYLES

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

export function prefixMarkdownLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n')
}

// Exported for tests only — proves this entry point and processMarkdown()
// (used by NotesDrawer) render identically since both call the same
// `markdownProcessor` from src/lib/markdown.ts.
export async function renderMarkdownContent(content: string): Promise<string> {
  if (!content.trim()) return ''
  try {
    const result = await markdownEditorProcessor.process(content)
    return String(result)
  } catch (e) {
    const msg = (e as Error).message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<p role="alert" aria-live="assertive" style="color: var(--color-error)">Render error: ${msg}</p>`
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function MarkdownEditor() {
  const isInstanceActive = useIsInstanceActive()
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<MarkdownEditorState>('markdown-editor', {
    content: '',
    fileName: null,
    filePath: null,
    savedContent: '',
    mode: 'split',
    showToc: false,
    scrollSync: true,
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const [mountedEditor, setMountedEditor] = useState<EditorInstance | null>(null)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showFileMenu, setShowFileMenu] = useState(false)
  const [activeModal, setActiveModal] = useState<'link' | 'image' | 'code' | 'table' | null>(null)
  const [pendingDocument, setPendingDocument] = useState<PendingDocument | null>(null)
  const templatesRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  // ─── Hooks ────────────────────────────────────────────────────────

  const showEditor = state.mode === 'split' || state.mode === 'edit'
  const showPreview = state.mode === 'split' || state.mode === 'preview'
  const isDirty = state.content !== state.savedContent
  useTabDirty(isDirty)

  useScrollSync(editorRef, previewRef, state.scrollSync && state.mode === 'split')
  const { isDraggingImage } = useImageDrop(editorRef, editorContainerRef)
  useMarkdownListEditing(mountedEditor)
  useMarkdownSmartPaste(mountedEditor)
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
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      const nextHtml = await renderMarkdownContent(state.content)
      if (!cancelled) setHtml(nextHtml)
    }, 300)

    return () => {
      cancelled = true
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

  const applyDocument = useCallback(
    (document: PendingDocument) => {
      updateState({
        content: document.content,
        fileName: document.fileName,
        filePath: document.filePath,
        savedContent: document.savedContent,
      })
      setPendingDocument(null)
      setLastAction(document.successMessage, 'success')
    },
    [setLastAction, updateState]
  )

  const requestDocument = useCallback(
    (document: PendingDocument) => {
      if (isDirty) {
        setPendingDocument(document)
        return
      }
      applyDocument(document)
    },
    [applyDocument, isDirty]
  )

  const handleNewDocument = useCallback(() => {
    requestDocument({
      content: '',
      fileName: null,
      filePath: null,
      savedContent: '',
      successMessage: 'New document created',
    })
  }, [requestDocument])

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

  useEffect(() => {
    if (!showFileMenu) return
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFileMenu])

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
      if (lineStart && selectedText && !prefix.includes('\n')) {
        insertText = prefixMarkdownLines(selectedText, prefix)
      } else if (lineStart && !selectedText) {
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
      await copy(text, {
        success: 'Selection copied to clipboard',
        failure: 'Failed to copy selection',
      })
    },
    [copy]
  )

  const copyPreviewQuote = useCallback(
    async (text: string) => {
      const quote = text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      await copy(quote, {
        success: 'Quoted selection copied to clipboard',
        failure: 'Failed to copy selection',
      })
    },
    [copy]
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

  // ─── Find and replace ────────────────────────────────────────────

  /**
   * Open Monaco's find (or find-and-replace) widget.
   *
   * Deliberately *not* a hand-rolled panel. Monaco already ships one with regex, case sensitivity,
   * whole-word, find-in-selection, match counts and Enter/Shift-Enter cycling — all of it already
   * wired to the model this editor is using. A second panel beside it would be a worse widget in a
   * second place, and the two would disagree about which match is current.
   *
   * What was actually missing is everything around it: the widget was reachable only by pressing
   * ⌘F while the caret was already in the editor, with nothing in the UI to say it existed, and
   * nothing at all in Preview mode.
   */
  const openFind = useCallback(
    (replace: boolean) => {
      // Preview has no editor to search. Switching to split is better than refusing: the user asked
      // to find something, and the only way to honour that is to show them the text.
      if (state.mode === 'preview') updateState({ mode: 'split' })

      // Retried rather than deferred one frame, and the check is DOM connectivity rather than
      // `editorRef.current != null`. Preview unmounts the editor without clearing the ref, so the
      // ref still points at the *previous*, detached instance — `getAction` on it silently does
      // nothing, and the mode flipped with no find widget in sight. Waiting for a connected DOM
      // node is what distinguishes the live instance from the corpse. Found in the browser
      // harness; jsdom cannot see it because it never mounts a real Monaco.
      const deadline = Date.now() + 3000
      const attempt = () => {
        const editor = editorRef.current
        if (!editor || !editor.getDomNode()?.isConnected) {
          if (Date.now() < deadline) requestAnimationFrame(attempt)
          return
        }
        editor.focus()
        void editor
          .getAction(replace ? 'editor.action.startFindReplaceAction' : 'actions.find')
          ?.run()
      }
      requestAnimationFrame(attempt)
    },
    [state.mode, updateState]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (!e.metaKey && !e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key !== 'f' && key !== 'h') return
      // When the caret is already in the editor, Monaco's own keybinding handles this and does it
      // better — it seeds the search box from the selection. Only step in when it can't.
      if (editorRef.current?.hasTextFocus()) return
      e.preventDefault()
      openFind(key === 'h')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isInstanceActive, openFind])

  // ─── Keyboard shortcuts for formatting ───────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isInstanceActive) return
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
  }, [insertFormatting, isInstanceActive])

  // ─── Export handlers ─────────────────────────────────────────────

  const buildFullHtml = useCallback(
    (bodyHtml: string, styles: string) =>
      `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Export</title>\n<style>${styles}</style>\n</head><body>${bodyHtml}</body></html>`,
    []
  )

  const buildCurrentExportHtml = useCallback(
    async (styles: string) => buildFullHtml(await renderMarkdownContent(state.content), styles),
    [buildFullHtml, state.content]
  )

  const handleCopyHtml = useCallback(async () => {
    await copy(await buildCurrentExportHtml(BASE_EXPORT_STYLES), {
      success: 'HTML copied to clipboard',
      failure: 'Failed to copy HTML',
    })
    setShowExport(false)
  }, [buildCurrentExportHtml, copy])

  const handleDownload = useCallback(
    async (format: 'md' | 'html') => {
      const content =
        format === 'md' ? state.content : await buildCurrentExportHtml(BASE_EXPORT_STYLES)
      try {
        const baseName = state.fileName?.replace(/\.[^.]+$/, '') ?? 'document'
        const path = await exportFile(content, buildExportFilename(baseName, format))
        if (path) setLastAction(`Downloaded as .${format}`, 'success')
      } catch {
        setLastAction('Download failed', 'error')
      }
      setShowExport(false)
    },
    [buildCurrentExportHtml, state.content, state.fileName, setLastAction]
  )

  // ─── Open / Save ──────────────────────────────────────────────────

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog()
      if (result) {
        requestDocument({
          content: result.content,
          fileName: result.filename,
          filePath: result.path,
          savedContent: result.content,
          successMessage: `Opened ${result.filename}`,
        })
      }
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : String(err), 'error')
    }
  }, [requestDocument, setLastAction])

  const handleSaveAs = useCallback(async () => {
    try {
      const path = await saveFileDialog(state.content, state.fileName ?? 'document.md')
      if (path) {
        const fileName = filenameFromPath(path)
        updateState({ filePath: path, fileName, savedContent: state.content })
        setLastAction(`Saved ${fileName}`, 'success')
      } else {
        setLastAction('Save cancelled', 'info')
      }
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.content, state.fileName, updateState, setLastAction])

  // Shared by the File > Save menu item and the ⌘S shortcut so they cannot drift.
  const handleSave = useCallback(async () => {
    if (!state.filePath) {
      await handleSaveAs()
      return
    }
    try {
      await saveFileToPath(state.filePath, state.content)
      updateState({ savedContent: state.content })
      setLastAction(`Saved ${state.fileName ?? filenameFromPath(state.filePath)}`, 'success')
    } catch (err) {
      setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [state.filePath, state.content, state.fileName, updateState, setLastAction, handleSaveAs])

  useToolAction((action) => {
    if (action.type === 'open-file') {
      requestDocument({
        content: action.content,
        fileName: action.filename,
        filePath: action.path ?? null,
        savedContent: action.content,
        successMessage: `Opened ${action.filename}`,
      })
    }
    if (action.type === 'save-file') {
      void handleSave()
    }
  })

  const handleExportPdf = useCallback(async () => {
    const fullHtml = await buildCurrentExportHtml(PRINT_STYLES)
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
  }, [buildCurrentExportHtml, setLastAction])

  const handleToggleTask = useCallback(
    (index: number) => {
      updateState({ content: toggleTaskAtIndex(state.content, index) })
    },
    [state.content, updateState]
  )

  const handleTemplateSelect = useCallback(
    (content: string) => {
      const datedContent = content.replaceAll(
        TEMPLATE_DATE,
        new Date().toISOString().split('T')[0]!
      )
      setShowTemplates(false)
      requestDocument({
        content: datedContent,
        fileName: null,
        filePath: null,
        savedContent: '',
        successMessage: 'Template loaded',
      })
    },
    [requestDocument]
  )

  // Each pane renders identically whether it's alone or beside the other, so it's defined once
  // here and placed by the layout below rather than written out under both branches.
  const editorPane = (
    <div ref={editorContainerRef} className="relative min-h-0 flex-1 overflow-hidden">
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
  )

  const previewPane = (
    <div className="min-h-0 flex-1">
      <MarkdownPreview
        ref={previewRef}
        html={html}
        showToc={state.showToc}
        toc={toc}
        onToggleTask={handleToggleTask}
      />
    </div>
  )

  return (
    <ToolLayout fullBleed>
      {/* No seam: nothing stacks under the toolbar inside this header, so a border here would be
          the single-row divider the toolbar primitive dropped, just re-expressed on the wrapper. */}
      <header className="bg-[var(--color-surface)]">
        <DocumentToolbar aria-label="Markdown document actions">
          <DocumentIdentity
            title={state.fileName ?? 'Untitled document'}
            titleTooltip={state.filePath ?? state.fileName ?? 'Untitled document'}
            titleTestId="file-name"
            stateLabel={isDirty ? 'Modified' : 'Saved'}
            stateChanged={isDirty}
            status={state.filePath ?? 'Local markdown workspace'}
            // The path is context, not a result — announcing it on every open
            // would talk over the Modified/Saved indicator that matters.
            statusLive={false}
          />

          <ToolbarGroup label="View options" separated>
            <SegmentedControl
              aria-label="Editor view mode"
              options={MODE_OPTIONS}
              value={state.mode as EditorMode}
              onChange={(mode) => updateState({ mode })}
            />

            {state.mode === 'split' && (
              <Button
                type="button"
                variant="icon"
                size="sm"
                onClick={() => updateState({ scrollSync: !state.scrollSync })}
                title={state.scrollSync ? 'Disable scroll sync' : 'Enable scroll sync'}
                aria-label={state.scrollSync ? 'Disable scroll sync' : 'Enable scroll sync'}
                aria-pressed={state.scrollSync}
                className={state.scrollSync ? 'text-[var(--color-accent)]' : ''}
              >
                <ArrowsClockwiseIcon
                  size={14}
                  weight={state.scrollSync ? 'bold' : 'regular'}
                  aria-hidden="true"
                />
              </Button>
            )}

            {toc.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateState({ showToc: !state.showToc })}
                className={
                  state.showToc ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                }
                title="Table of contents"
                aria-pressed={state.showToc}
              >
                Contents
              </Button>
            )}
          </ToolbarGroup>

          {/* The find widget existed but had no entry point outside the editor's own keymap, so
              it was invisible unless you already knew it was there. */}
          <ToolbarGroup label="Find" separated>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => openFind(false)}
              title={`Find (${formatShortcut('mod+f')})`}
              aria-label={`Find (${formatShortcut('mod+f')})`}
            >
              <MagnifyingGlassIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => openFind(true)}
              title={`Find and replace (${formatShortcut('mod+h')})`}
              aria-label={`Find and replace (${formatShortcut('mod+h')})`}
            >
              <SwapIcon size={14} aria-hidden="true" />
            </Button>
          </ToolbarGroup>

          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--color-border)]" />
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={handleNewDocument}
            title="New document"
            aria-label="New document"
          >
            <FilePlusIcon size={14} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={() => void handleOpen()}
            title="Open markdown file"
            aria-label="Open markdown file"
          >
            <FolderOpenIcon size={14} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            className="gap-1.5"
          >
            <FloppyDiskIcon size={14} aria-hidden="true" /> Save
          </Button>

          <div ref={fileMenuRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowFileMenu(!showFileMenu)}
              className={
                showFileMenu ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
              }
              aria-expanded={showFileMenu}
              aria-haspopup="menu"
            >
              File <CaretDownIcon size={12} aria-hidden="true" className="ml-1" />
            </Button>
            {showFileMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-36 rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg"
              >
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    handleNewDocument()
                    setShowFileMenu(false)
                  }}
                  className="w-full justify-start"
                >
                  New
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleOpen()
                    setShowFileMenu(false)
                  }}
                  className="w-full justify-start"
                >
                  Open…
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleSave()
                    setShowFileMenu(false)
                  }}
                  className="w-full justify-start"
                >
                  Save
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleSaveAs()
                    setShowFileMenu(false)
                  }}
                  className="w-full justify-start"
                >
                  Save As…
                </Button>
              </div>
            )}
          </div>

          <div ref={templatesRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTemplates(!showTemplates)}
              className={
                showTemplates ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
              }
              aria-expanded={showTemplates}
              aria-haspopup="menu"
            >
              Templates
            </Button>
            {showTemplates && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg"
              >
                {TEMPLATES.map((template) => (
                  <Button
                    key={template.label}
                    role="menuitem"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTemplateSelect(template.content)}
                    className="w-full justify-start text-left"
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div ref={exportRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowExport(!showExport)}
              className={`gap-1 ${showExport ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''}`}
              aria-expanded={showExport}
              aria-haspopup="menu"
            >
              Export <CaretDownIcon size={12} aria-hidden="true" />
            </Button>
            {showExport && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg"
              >
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void copy(state.content, {
                      success: 'Markdown copied to clipboard',
                      failure: 'Failed to copy to clipboard',
                    })
                    setShowExport(false)
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Copy Markdown
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleCopyHtml()
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Copy HTML
                </Button>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleDownload('md')
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Download .md
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleDownload('html')
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Download .html
                </Button>
                <Button
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleExportPdf()
                  }}
                  className="w-full justify-start text-left hover:text-[var(--color-text)]"
                >
                  Print / PDF
                </Button>
              </div>
            )}
          </div>
        </DocumentToolbar>
      </header>

      {/* ─── Formatting Toolbar ─────────────────────────────────── */}
      {showEditor && (
        <div
          role="toolbar"
          aria-label="Markdown formatting"
          className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--color-border)] px-2 py-1"
        >
          {FORMATTING_ACTIONS.map((action, i) => {
            const prev = FORMATTING_ACTIONS[i - 1]
            const showSep = i > 0 && prev !== undefined && action.group !== prev.group
            const Icon = action.icon
            return (
              <Fragment key={action.title}>
                {showSep && (
                  <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--color-border)]" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
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
                  aria-label={action.title}
                  className="hover:text-[var(--color-text)]"
                >
                  {Icon ? <Icon size={12} aria-hidden="true" /> : action.label}
                </Button>
              </Fragment>
            )
          })}
        </div>
      )}

      {/* ─── Body ───────────────────────────────────────────────── */}
      {/* Split mode goes through SplitPane; the single-pane modes are a plain full-width box.
          Below ~1000px SplitPane stacks them — markdown needs more line length than most panes
          before a 50/50 split stops being readable. */}
      {showEditor && showPreview ? (
        <SplitPane
          storageKey="markdown-editor"
          stackBelow={1000}
          aria-label="Resize editor and preview"
        >
          {editorPane}
          {previewPane}
        </SplitPane>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showEditor ? editorPane : previewPane}
        </div>
      )}

      <footer className="flex min-h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-2xs text-[var(--color-text-muted)]">
        <span>{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        {stats ? (
          <span title={`${stats.lines} lines · ${stats.paragraphs} paragraphs`}>
            {stats.words}w · {stats.chars}c · {stats.readTime}
          </span>
        ) : (
          <span>Empty document</span>
        )}
        <span className="ml-auto capitalize">{state.mode} view</span>
      </footer>

      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          size="md"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                Discard changes
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Your current document has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}

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
    </ToolLayout>
  )
}
