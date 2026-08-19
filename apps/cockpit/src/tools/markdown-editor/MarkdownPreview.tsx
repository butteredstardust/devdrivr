import { useCallback, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme, isLightEffectiveTheme } from '@/lib/theme'
import { Button } from '@/components/shared/Button'
import { SectionLabel } from '@/components/shared/SectionLabel'
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

// ─── Component ──────────────────────────────────────────────────────

export const MarkdownPreview = forwardRef<HTMLDivElement, MarkdownPreviewProps>(
  function MarkdownPreview({ html, showToc, toc, onToggleTask }, ref) {
    const innerRef = useRef<HTMLDivElement>(null)
    const mermaidRenderSeqRef = useRef(0)
    const theme = useSettingsStore((s) => s.theme)

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
        if (toggleFromEventTarget(e.target)) e.preventDefault()
      },
      [toggleFromEventTarget]
    )

    const handlePreviewKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Enter') return
        if (toggleFromEventTarget(e.target)) e.preventDefault()
      },
      [toggleFromEventTarget]
    )

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

    // Expose the inner div via forwarded ref for scroll sync
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    useImperativeHandle(ref, () => innerRef.current!, []) // safe: called after mount, ref is populated

    // ─── Mermaid diagrams (theme-aware) ───────────────────────────
    useEffect(() => {
      if (!html || !innerRef.current) return
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
    }, [html, theme])

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
      <div className="flex h-full overflow-hidden">
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
          className="flex-1 overflow-auto p-6"
          data-selection-surface="markdown-preview"
          onClick={handlePreviewClick}
          onKeyDown={handlePreviewKeyDown}
        >
          {html ? (
            <div className={PREVIEW_STYLES} dangerouslySetInnerHTML={htmlProp} />
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">
              Start typing markdown in the editor...
            </div>
          )}
        </div>
      </div>
    )
  }
)
