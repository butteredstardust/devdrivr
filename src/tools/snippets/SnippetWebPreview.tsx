import { XIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'

export function SnippetWebPreview({
  document,
  onClose,
}: {
  document: string
  onClose: () => void
}) {
  return (
    <aside
      aria-label="Snippet web preview"
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[var(--color-surface)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-[var(--color-text)]">HTML/CSS preview</h2>
          <p className="truncate text-2xs text-[var(--color-text-muted)]">
            Scripts, navigation, forms, and remote requests are disabled.
          </p>
        </div>
        <Button
          type="button"
          variant="icon"
          size="sm"
          onClick={onClose}
          aria-label="Close snippet preview"
        >
          <XIcon size={14} aria-hidden="true" />
        </Button>
      </header>
      <iframe
        title="Rendered snippet preview"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={document}
        className="min-h-0 flex-1 border-0 bg-[var(--color-bg)]"
      />
    </aside>
  )
}
