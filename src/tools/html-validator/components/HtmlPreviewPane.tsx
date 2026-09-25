import { FrameCornersIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { PaneHeader } from '@/components/shared/PaneHeader'

type HtmlPreviewPaneProps = {
  previewHtml: string
  hasInput: boolean
  onExpand: () => void
}

export function HtmlPreviewPane({ previewHtml, hasInput, onExpand }: HtmlPreviewPaneProps) {
  return (
    <section aria-label="Rendered preview" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PaneHeader
        title="Preview"
        actions={
          <Button
            variant="ghost"
            size="xs"
            onClick={onExpand}
            disabled={!hasInput}
            className="gap-1"
            title="Expand to a full-size preview (Esc to close)"
          >
            <FrameCornersIcon size={12} aria-hidden="true" />
            Expand
          </Button>
        }
      />
      <div className="min-h-0 flex-1 bg-[var(--color-bg)]">
        {/* Deliberate palette exception below: the preview is a page
            canvas, not app chrome, and user HTML assumes a white
            background — on --color-bg its black body text is unreadable. */}
        {previewHtml ? (
          <iframe
            title="HTML preview"
            sandbox=""
            srcDoc={previewHtml}
            className="h-full w-full border-none bg-white"
          />
        ) : (
          <EmptyState
            size="sm"
            title={hasInput ? 'Rendering…' : 'Nothing to preview'}
            description={
              hasInput
                ? 'The preview follows the source a moment behind.'
                : 'Type or open HTML in the source pane.'
            }
          />
        )}
      </div>
    </section>
  )
}
