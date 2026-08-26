import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme, isLightEffectiveTheme } from '@/lib/theme'
import { Button } from '@/components/shared/Button'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TextArea } from '@/components/shared/TextArea'
import { Toggle } from '@/components/shared/Toggle'
import { nextHeadingId } from './heading-ids'

type TocEntry = {
  level: number
  text: string
  id: string
}

type MarkdownPreviewProps = {
  html: string
  showToc: boolean
  toc: TocEntry[]
  /** Called with the source-order index of a GFM task-list checkbox that was toggled. */
  onToggleTask?: (index: number) => void
  source?: string
  editingEnabled?: boolean
  showEditingToggle?: boolean
  onEditingEnabledChange?: (enabled: boolean) => void
  onSourceChange?: (source: string) => void
  onEditCaretChange?: (offset: number) => void
  onRevealSource?: (line: number) => void
  activeSourceLine?: number | null
}

type ActiveBlockEdit = {
  start: number
  tagName: string
  originalSource: string
  changed: boolean
  prefix: string
  suffix: string
  draft: string
  left: number
  top: number
  width: number
  minHeight: number
}

// ─── Preview Styles (extracted + polished) ──────────────────────────

const proseBase = ['prose max-w-none', 'text-sm leading-relaxed', 'text-[var(--color-text)]'].join(
  ' '
)

const proseHeadings = [
  '[&_h1]:font-mono [&_h1]:text-xl [&_h1]:text-[var(--color-accent)] [&_h1]:mb-4 [&_h1]:mt-6',
  '[&_h2]:font-mono [&_h2]:text-lg [&_h2]:text-[var(--color-accent)] [&_h2]:mb-3 [&_h2]:mt-5',
  '[&_h3]:font-mono [&_h3]:text-base [&_h3]:mb-2 [&_h3]:mt-4',
  '[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mb-2 [&_h4]:mt-3',
].join(' ')

const proseCode = [
  '[&_code]:rounded [&_code]:bg-[var(--color-surface)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs',
  '[&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--color-border)]',
  '[&_pre]:bg-[var(--color-surface)] [&_pre]:p-4 [&_pre]:my-4',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:leading-relaxed',
].join(' ')

const proseLinks = '[&_a]:text-[var(--color-accent)] [&_a]:underline [&_a]:underline-offset-2'

const proseTables = [
  '[&_table]:border-collapse [&_table]:w-full [&_table]:my-4',
  '[&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-xs',
  '[&_tr:nth-child(even)]:bg-[var(--color-surface)]/30',
].join(' ')

const proseBlockquotes = [
  '[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-accent)]',
  '[&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:italic',
  '[&_blockquote]:text-[var(--color-text-muted)]',
].join(' ')

const proseLists = [
  '[&_li]:marker:text-[var(--color-accent)]',
  '[&_ul]:my-2 [&_ol]:my-2',
  '[&_li]:my-0.5',
].join(' ')

const proseCheckboxes = [
  '[&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-[var(--color-accent)]',
  '[&_input[type=checkbox]]:relative [&_input[type=checkbox]]:top-[1px]',
].join(' ')

const proseImages = [
  '[&_img]:max-w-full [&_img]:rounded-lg',
  '[&_img]:shadow-sm [&_img]:my-4',
].join(' ')

const proseSpacing = ['[&_p]:my-3', '[&_hr]:border-[var(--color-border)] [&_hr]:my-6'].join(' ')

const PREVIEW_STYLES = [
  proseBase,
  proseHeadings,
  proseCode,
  proseLinks,
  proseTables,
  proseBlockquotes,
  proseLists,
  proseCheckboxes,
  proseImages,
  proseSpacing,
].join(' ')

function findSourceBlock(surface: HTMLElement, start: number, tagName: string): HTMLElement | null {
  const matches = Array.from(
    surface.querySelectorAll<HTMLElement>(`[data-markdown-start="${start}"]`)
  )
  return matches.find((element) => element.tagName === tagName) ?? matches[0] ?? null
}

function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return window.setTimeout(callback, 0)
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else window.clearTimeout(handle)
}

// ─── Component ──────────────────────────────────────────────────────

export const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  function MarkdownPreview(
    {
      html,
      showToc,
      toc,
      onToggleTask,
      source = '',
      editingEnabled = false,
      showEditingToggle = false,
      onEditingEnabledChange,
      onSourceChange,
      onEditCaretChange,
      onRevealSource,
      activeSourceLine = null,
    },
    ref
  ) {
    const innerRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<HTMLTextAreaElement>(null)
    const ignoreNextBlurRef = useRef(false)
    const previewUndoStackRef = useRef<string[]>([])
    const mermaidRenderSeqRef = useRef(0)
    const [activeEdit, setActiveEdit] = useState<ActiveBlockEdit | null>(null)
    const editHelpId = useId()
    const theme = useSettingsStore((s) => s.theme)

    const beginBlockEdit = useCallback(
      (element: HTMLElement, start: number, end: number) => {
        if (!innerRef.current || !onSourceChange) return
        const surfaceRect = innerRef.current.getBoundingClientRect()
        const blockRect = element.getBoundingClientRect()
        const draft = source.slice(start, end)
        setActiveEdit({
          start,
          tagName: element.tagName,
          originalSource: source,
          changed: false,
          prefix: source.slice(0, start),
          suffix: source.slice(end),
          draft,
          left: blockRect.left - surfaceRect.left + innerRef.current.scrollLeft,
          top: blockRect.top - surfaceRect.top + innerRef.current.scrollTop,
          width: blockRect.width,
          minHeight: Math.max(blockRect.height, 44),
        })
        scheduleFrame(() => {
          const editor = editorRef.current
          if (!editor) return
          editor.focus()
          editor.setSelectionRange(draft.length, draft.length)
          onEditCaretChange?.(start + draft.length)
        })
      },
      [onEditCaretChange, onSourceChange, source]
    )

    const beginEditFromTarget = useCallback(
      (target: EventTarget | null) => {
        if (!editingEnabled || !(target instanceof window.HTMLElement)) return false
        const block = target.closest<HTMLElement>('[data-markdown-start][data-markdown-end]')
        if (!block || !innerRef.current?.contains(block)) return false
        const start = Number(block.dataset.markdownStart)
        const end = Number(block.dataset.markdownEnd)
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
          return false
        }
        beginBlockEdit(block, start, end)
        return true
      },
      [beginBlockEdit, editingEnabled]
    )

    // ─── Task checkbox interaction (click + Enter; Space reaches here via the
    // native click a focused checkbox fires) ──────────────────────────────
    const toggleFromEventTarget = useCallback(
      (target: EventTarget | null) => {
        if (!onToggleTask || !innerRef.current) return false
        if (!(target instanceof window.HTMLInputElement) || target.type !== 'checkbox') return false
        const checkboxes = innerRef.current.querySelectorAll('input[type="checkbox"]')
        const index = Array.prototype.indexOf.call(checkboxes, target)
        if (index === -1) return false
        onToggleTask(index)
        return true
      },
      [onToggleTask]
    )

    const handlePreviewClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (toggleFromEventTarget(e.target)) {
          e.preventDefault()
          return
        }
        if (beginEditFromTarget(e.target)) e.preventDefault()
      },
      [beginEditFromTarget, toggleFromEventTarget]
    )

    const handlePreviewKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Enter') return
        if (toggleFromEventTarget(e.target) || beginEditFromTarget(e.target)) e.preventDefault()
      },
      [beginEditFromTarget, toggleFromEventTarget]
    )

    const handlePreviewDoubleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (editingEnabled || !onRevealSource) return
        if (!(event.target instanceof window.HTMLElement)) return
        if (event.target.closest('a, button, input, textarea')) return
        const block = event.target.closest<HTMLElement>(
          '[data-markdown-start-line][data-markdown-end-line]'
        )
        if (!block || !innerRef.current?.contains(block)) return
        const line = Number(block.dataset.markdownStartLine)
        if (!Number.isInteger(line) || line < 1) return
        event.preventDefault()
        onRevealSource(line)
      },
      [editingEnabled, onRevealSource]
    )

    const updateDraft = useCallback(
      (draft: string, caret: number) => {
        if (!activeEdit) return
        if (!activeEdit.changed) previewUndoStackRef.current.push(activeEdit.originalSource)
        setActiveEdit((current) => (current ? { ...current, changed: true, draft } : null))
        onSourceChange?.(`${activeEdit.prefix}${draft}${activeEdit.suffix}`)
        onEditCaretChange?.(activeEdit.start + caret)
      },
      [activeEdit, onEditCaretChange, onSourceChange]
    )

    const finishBlockEdit = useCallback(() => {
      if (!activeEdit) return
      onEditCaretChange?.(
        activeEdit.start + (editorRef.current?.selectionStart ?? activeEdit.draft.length)
      )
      setActiveEdit(null)
    }, [activeEdit, onEditCaretChange])

    const cancelBlockEdit = useCallback(() => {
      if (!activeEdit) return
      ignoreNextBlurRef.current = true
      if (activeEdit.changed) previewUndoStackRef.current.pop()
      onSourceChange?.(activeEdit.originalSource)
      onEditCaretChange?.(activeEdit.start)
      setActiveEdit(null)
      window.queueMicrotask(() => {
        ignoreNextBlurRef.current = false
      })
    }, [activeEdit, onEditCaretChange, onSourceChange])

    useEffect(() => {
      if (!editingEnabled) previewUndoStackRef.current = []
    }, [editingEnabled])

    useEffect(() => {
      if (!editingEnabled || activeEdit || !onSourceChange) return
      const handleUndo = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() !== 'z' || (!event.metaKey && !event.ctrlKey)) return
        const surface = innerRef.current
        const focused = document.activeElement
        if (!surface || (focused !== document.body && !surface.contains(focused))) return
        const previous = previewUndoStackRef.current.pop()
        if (previous === undefined) return
        event.preventDefault()
        onSourceChange(previous)
        onEditCaretChange?.(0)
      }
      window.addEventListener('keydown', handleUndo)
      return () => window.removeEventListener('keydown', handleUndo)
    }, [activeEdit, editingEnabled, onEditCaretChange, onSourceChange])

    // ─── Rendered HTML payload ────────────────────────────────────
    // Memoised deliberately. React 19's `updateProperties` compares
    // `dangerouslySetInnerHTML` by *object identity*, not by the `__html` string
    // inside it (React 18 compared the string). An inline `{ __html: html }`
    // literal is a new object on every render, so React re-set innerHTML on each
    // one — tearing down and rebuilding the whole subtree even when the markup
    // was byte-identical. That destroyed any text selection the user had made in
    // the preview: selecting text updates the selection-toolbar state, which
    // re-renders this component, which wiped the very selection being tracked.
    // Keeping the object stable makes React skip the write entirely.
    const htmlProp = useMemo(() => ({ __html: html }), [html])

    const remeasureActiveEdit = useCallback(() => {
      const surface = innerRef.current
      if (!surface) return
      setActiveEdit((current) => {
        if (!current) return null
        const block = findSourceBlock(surface, current.start, current.tagName)
        if (!block) return current
        const surfaceRect = surface.getBoundingClientRect()
        const blockRect = block.getBoundingClientRect()
        if (blockRect.width <= 0 || blockRect.height <= 0) return current
        const nextGeometry = {
          left: blockRect.left - surfaceRect.left + surface.scrollLeft,
          top: blockRect.top - surfaceRect.top + surface.scrollTop,
          width: blockRect.width,
          minHeight: Math.max(blockRect.height, 44),
        }
        if (
          current.left === nextGeometry.left &&
          current.top === nextGeometry.top &&
          current.width === nextGeometry.width &&
          current.minHeight === nextGeometry.minHeight
        ) {
          return current
        }
        return { ...current, ...nextGeometry }
      })
    }, [])

    useLayoutEffect(() => {
      if (!activeEdit || !innerRef.current) return
      const surface = innerRef.current
      const block = findSourceBlock(surface, activeEdit.start, activeEdit.tagName)
      const frame = scheduleFrame(remeasureActiveEdit)
      const handleResize = () => remeasureActiveEdit()
      window.addEventListener('resize', handleResize)

      let observer: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(handleResize)
        observer.observe(surface)
        if (block) observer.observe(block)
      }

      return () => {
        cancelFrame(frame)
        window.removeEventListener('resize', handleResize)
        observer?.disconnect()
      }
    }, [activeEdit, html, remeasureActiveEdit, showToc])

    useLayoutEffect(() => {
      const editor = editorRef.current
      if (!editor || !activeEdit) return
      editor.style.height = '0px'
      editor.style.height = `${Math.max(activeEdit.minHeight, editor.scrollHeight)}px`
    }, [activeEdit])

    useEffect(() => {
      const surface = innerRef.current
      if (!surface) return
      const previous = surface.querySelector<HTMLElement>('[data-source-active]')
      previous?.removeAttribute('data-source-active')
      previous?.classList.remove('markdown-preview-source-active')
      if (activeSourceLine === null) return

      const candidates = Array.from(
        surface.querySelectorAll<HTMLElement>('[data-markdown-start-line][data-markdown-end-line]')
      ).filter((element) => {
        const startLine = Number(element.dataset.markdownStartLine)
        const endLine = Number(element.dataset.markdownEndLine)
        return activeSourceLine >= startLine && activeSourceLine <= endLine
      })
      const active = candidates.sort((a, b) => {
        const aSpan = Number(a.dataset.markdownEndLine) - Number(a.dataset.markdownStartLine)
        const bSpan = Number(b.dataset.markdownEndLine) - Number(b.dataset.markdownStartLine)
        return aSpan - bSpan
      })[0]
      active?.setAttribute('data-source-active', '')
      active?.classList.add('markdown-preview-source-active')

      return () => {
        active?.removeAttribute('data-source-active')
        active?.classList.remove('markdown-preview-source-active')
      }
    }, [activeSourceLine, html])

    // The rendered elements come from sanitized HTML, so opt them into the tab order only while
    // editing is enabled. Enter then follows the same delegated path as a pointer click.
    useEffect(() => {
      if (!editingEnabled || !innerRef.current) return
      const blocks = innerRef.current.querySelectorAll<HTMLElement>(
        '[data-markdown-start][data-markdown-end]'
      )
      blocks.forEach((block) => block.setAttribute('tabindex', '0'))
      return () => blocks.forEach((block) => block.removeAttribute('tabindex'))
    }, [editingEnabled, html])

    // Expose the inner div via forwarded ref for scroll sync
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    useImperativeHandle(ref, () => innerRef.current!, []) // safe: called after mount, ref is populated

    // ─── Mermaid diagrams (theme-aware) ───────────────────────────
    useEffect(() => {
      if (!html || !innerRef.current || editingEnabled) return
      const renderSeq = (mermaidRenderSeqRef.current += 1)
      let cancelled = false
      const mermaidBlocks = innerRef.current.querySelectorAll('code.language-mermaid')
      if (mermaidBlocks.length === 0) return

      const effective = getEffectiveTheme(theme)
      const mermaidTheme = isLightEffectiveTheme(effective) ? 'default' : 'dark'

      import('mermaid').then(({ default: mermaid }) => {
        if (cancelled || renderSeq !== mermaidRenderSeqRef.current) return
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme })
        mermaidBlocks.forEach(async (block, i) => {
          const parent = block.parentElement
          if (!parent) return
          try {
            const { svg } = await mermaid.render(
              `mermaid-${Date.now()}-${i}`,
              block.textContent ?? ''
            )
            if (cancelled || renderSeq !== mermaidRenderSeqRef.current) return
            const wrapper = document.createElement('div')
            wrapper.className = 'mermaid-diagram'
            for (const attribute of parent.attributes) {
              if (attribute.name.startsWith('data-markdown-')) {
                wrapper.setAttribute(attribute.name, attribute.value)
              }
            }
            if (parent.hasAttribute('data-source-active')) {
              wrapper.setAttribute('data-source-active', '')
              wrapper.classList.add('markdown-preview-source-active')
            }
            wrapper.innerHTML = svg
            parent.replaceWith(wrapper)
          } catch {
            // Leave as code block on error
          }
        })
      })
      return () => {
        cancelled = true
      }
    }, [editingEnabled, html, theme])

    // ─── TOC scroll ───────────────────────────────────────────────
    function scrollToHeading(id: string) {
      if (!innerRef.current) return
      const headings = innerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
      const headingCounts = new Map<string, number>()
      for (const h of headings) {
        const hId = nextHeadingId(h.textContent ?? '', headingCounts)
        if (hId === id) {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' })
          break
        }
      }
    }

    return (
      <div className="relative flex h-full overflow-hidden">
        {showEditingToggle && onEditingEnabledChange && (
          <div className="absolute right-3 top-3 z-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 shadow-sm">
            <Toggle
              checked={editingEnabled}
              onChange={(enabled) => {
                finishBlockEdit()
                onEditingEnabledChange(enabled)
              }}
              label="Edit preview"
              aria-label="Edit preview"
            />
          </div>
        )}

        {/* TOC Sidebar */}
        {showToc && toc.length > 0 && (
          <div className="w-48 shrink-0 overflow-auto border-r border-[var(--color-border)] p-3">
            <SectionLabel as="div" className="mb-2">
              Contents
            </SectionLabel>
            {toc.map((entry, i) => (
              <Button
                key={`${entry.id}-${i}`}
                variant="ghost"
                size="xs"
                onClick={() => scrollToHeading(entry.id)}
                className="block w-full truncate rounded-none p-0 text-left text-xs leading-relaxed text-[var(--color-text-muted)] hover:bg-transparent hover:text-[var(--color-accent)]"
                style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}
                title={entry.text}
              >
                {entry.text}
              </Button>
            ))}
          </div>
        )}

        {/* Preview Content */}
        <div
          ref={innerRef}
          className={`relative flex-1 overflow-auto p-6 ${editingEnabled ? 'cursor-text' : ''}`}
          data-selection-surface="markdown-preview"
          onClick={handlePreviewClick}
          onDoubleClick={handlePreviewDoubleClick}
          onKeyDown={handlePreviewKeyDown}
        >
          {html ? (
            <div
              // Remounting only when the mode flips restores canonical markup after Mermaid may
              // have replaced a source code block with SVG. Ordinary renders retain DOM identity.
              key={editingEnabled ? 'editing' : 'reading'}
              className={`${PREVIEW_STYLES} ${
                editingEnabled
                  ? '[&_[data-markdown-start]]:cursor-text [&_[data-markdown-start]:hover]:outline [&_[data-markdown-start]:hover]:outline-1 [&_[data-markdown-start]:hover]:outline-[var(--color-accent-dim)]'
                  : ''
              }`}
              dangerouslySetInnerHTML={htmlProp}
            />
          ) : (
            <div
              className="min-h-11 text-sm text-[var(--color-text-muted)]"
              data-markdown-start="0"
              data-markdown-end="0"
            >
              Start typing markdown in the editor...
            </div>
          )}
          {editingEnabled && activeEdit && (
            <>
              <TextArea
                ref={editorRef}
                value={activeEdit.draft}
                onChange={(event) =>
                  updateDraft(event.target.value, event.currentTarget.selectionStart)
                }
                onBlur={() => {
                  if (ignoreNextBlurRef.current) return
                  finishBlockEdit()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    cancelBlockEdit()
                  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    finishBlockEdit()
                  }
                }}
                aria-label="Edit markdown block"
                aria-describedby={editHelpId}
                monospace
                className="absolute z-10 resize-none overflow-hidden shadow-lg shadow-[var(--color-shadow)]"
                style={{
                  left: `${activeEdit.left}px`,
                  top: `${activeEdit.top}px`,
                  width: `${activeEdit.width}px`,
                  minHeight: `${activeEdit.minHeight}px`,
                }}
              />
              <span id={editHelpId} className="sr-only">
                Press Escape to cancel changes or Control or Command plus Enter to finish editing.
              </span>
            </>
          )}
        </div>
      </div>
    )
  }
)
