import { useRef, type ReactNode } from 'react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'

type Props = {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  /** Destructive actions get the danger button treatment. */
  tone?: 'danger' | 'default'
}

// Shared confirmation shell for the API Client's destructive and
// discard-changes prompts — replaces the native `confirm()` calls, which block
// the WebView, ignore the theme, and cannot be exercised in component tests.
// Focus starts on Cancel so a stray Enter never destroys anything.
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'danger',
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // This dialog is sometimes rendered inside another Dialog (the environment
  // manager). Shared `Dialog` handles Escape/Tab on its own panel but does not
  // stop propagation, so without this wrapper an Escape here would bubble to the
  // parent panel and close both. Swallow key events once the inner panel has
  // handled them.
  return (
    <div onKeyDown={(e) => e.stopPropagation()}>
      <Dialog
        title={title}
        onClose={onClose}
        closeLabel={`Close ${title.toLowerCase()} dialog`}
        initialFocusRef={cancelRef}
        className="w-[26rem] max-w-[calc(100vw-2rem)]"
        footer={
          <>
            <Button ref={cancelRef} type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-xs leading-relaxed text-[var(--color-text)]">{children}</div>
      </Dialog>
    </div>
  )
}
