import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'

type TocEntry = {
  level: number
  text: string
  id: string
}

type MarkdownPreviewProps = {
  html: string
  showToc: boolean
  toc: TocEntry[]
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
  function MarkdownPreview({ html, showToc, toc }, ref) {
    const innerRef = useRef<HTMLDivElement>(null)
    const theme = useSettingsStore((s) => s.theme)

    // Expose the inner div via forwarded ref for scroll sync
    useImperativeHandle(ref, () => innerRef.current!, [])

    // ─── Mermaid diagrams (theme-aware) ───────────────────────────
    useEffect(() => {
      if (!html || !innerRef.current) return
      const mermaidBlocks = innerRef.current.querySelectorAll('code.language-mermaid')
      if (mermaidBlocks.length === 0) return

      const effective = getEffectiveTheme(theme)
      const mermaidTheme = effective === 'soft-focus' ? 'default' : 'dark'

      import('mermaid').then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme })
        mermaidBlocks.forEach(async (block, i) => {
          const parent = block.parentElement
          if (!parent) return
          try {
            const { svg } = await mermaid.render(
              `mermaid-${Date.now()}-${i}`,
              block.textContent ?? ''
            )
            const wrapper = document.createElement('div')
            wrapper.className = 'mermaid-diagram'
            wrapper.innerHTML = svg
            parent.replaceWith(wrapper)
          } catch {
            // Leave as code block on error
          }
        })
      })
    }, [html, theme])

    // ─── TOC scroll ───────────────────────────────────────────────
    function scrollToHeading(id: string) {
      if (!innerRef.current) return
      const headings = innerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
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
    }

    return (
      <div className="flex h-full overflow-hidden">
        {/* TOC Sidebar */}
        {showToc && toc.length > 0 && (
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

        {/* Preview Content */}
        <div ref={innerRef} className="flex-1 overflow-auto p-6">
          {html ? (
            <div className={PREVIEW_STYLES} dangerouslySetInnerHTML={{ __html: html }} />
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
