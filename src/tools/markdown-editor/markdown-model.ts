/**
 * Markdown editor model: the document's types, its export stylesheet, and the pure functions that
 * turn markdown into HTML or HTML into a table of contents.
 *
 * Split out of `MarkdownEditor.tsx` (1,519 lines) so that the rendering pipeline and the export CSS
 * can be read — and tested — without the component that also owns Monaco, four modals, scroll sync
 * and the file lifecycle.
 */
import type { OnMount } from '@monaco-editor/react'
// Shared markdown pipeline — see src/lib/markdown.ts for plugin order rationale.
// This tool renders through `markdownEditorProcessor`, which is identical to the
// Notes drawer's `markdownProcessor` except that GFM task-list checkboxes are left
// enabled (not `disabled`) so the preview can toggle them — see the sanitize schema
// comment in src/lib/markdown.ts for why that variant exists instead of loosening
// the shared schema for every surface.
import { markdownEditableEditorProcessor, markdownEditorProcessor } from '@/lib/markdown'
import { nextHeadingId } from '@/tools/markdown-editor/heading-ids'

// ─── Types ───────────────────────────────────────────────────────────

export type MarkdownEditorState = {
  content: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  mode: string
  showToc: boolean
  scrollSync: boolean
  scrollSyncDirections?: {
    editorToPreview: boolean
    previewToEditor: boolean
  }
}

export type TocEntry = {
  level: number
  text: string
  id: string
}

export type PendingDocument = {
  content: string
  fileName: string | null
  filePath: string | null
  savedContent: string
  successMessage: string
}

export type EditorInstance = Parameters<OnMount>[0]

export type FormattingAction = {
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

export type EditorMode = 'edit' | 'split' | 'preview'

// Edit first — natural workflow order
export const MODE_OPTIONS: { value: EditorMode; label: string }[] = [
  { value: 'edit', label: 'Edit' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
]

export const WORDS_PER_MINUTE = 200
export const TEMPLATE_DATE = '{{current-date}}'

// ─── Export style constants ───────────────────────────────────────────

export const BASE_EXPORT_STYLES =
  ':root{' +
  '--export-bg:Canvas;' +
  '--export-text:CanvasText;' +
  '--export-muted:color-mix(in srgb, CanvasText 55%, Canvas 45%);' +
  '--export-border:color-mix(in srgb, CanvasText 18%, Canvas 82%);' +
  '--export-surface:color-mix(in srgb, Canvas 90%, CanvasText 10%);' +
  '--export-inverse-bg:color-mix(in srgb, CanvasText 88%, Canvas 12%);' +
  '--export-inverse-text:Canvas;' +
  '--export-accent:#8b5cf6;' +
  '--export-success:#16a34a;' +
  '--export-info:#0284c7;' +
  '}' +
  'body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;background:var(--export-bg);color:var(--export-text)}' +
  'code{background:var(--export-surface);padding:2px 6px;border-radius:3px;font-size:0.9em}' +
  'pre{background:var(--export-inverse-bg);color:var(--export-inverse-text);padding:16px;border-radius:6px;overflow-x:auto}' +
  'pre code{background:none;padding:0}' +
  '.hljs-comment,.hljs-quote{color:var(--export-muted)}' +
  '.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-type{color:var(--export-accent)}' +
  '.hljs-string,.hljs-title,.hljs-name,.hljs-attribute{color:var(--export-success)}' +
  '.hljs-number,.hljs-symbol,.hljs-bullet{color:var(--export-info)}' +
  'table{border-collapse:collapse;width:100%}th,td{border:1px solid var(--export-border);padding:8px 12px;text-align:left}' +
  'th{background:var(--export-surface)}blockquote{border-left:4px solid var(--export-border);margin:0;padding:0 16px;color:var(--export-muted)}img{max-width:100%}'

export const PRINT_STYLES = '@media print{body{margin:0}}' + BASE_EXPORT_STYLES

// ─── Helpers ─────────────────────────────────────────────────────────

export function extractToc(html: string): TocEntry[] {
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

export function readingTime(words: number): string {
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

export async function renderEditableMarkdownContent(content: string): Promise<string> {
  if (!content.trim()) return ''
  try {
    const result = await markdownEditableEditorProcessor.process(content)
    return String(result)
  } catch {
    return renderMarkdownContent(content)
  }
}
