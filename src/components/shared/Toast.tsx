import { XIcon } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/ui.store'

const TYPE_STYLES = {
  success: 'border-[var(--color-success)] text-[var(--color-success)]',
  error: 'border-[var(--color-error)] text-[var(--color-error)]',
  info: 'border-[var(--color-accent)] text-[var(--color-accent)]',
} as const

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts)
  const removeToast = useUiStore((s) => s.removeToast)

  // The live regions stay mounted even with nothing to say: a region inserted at the same moment
  // as its text is frequently not announced at all, because there was nothing there to observe.
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-[var(--z-toast)] flex flex-col gap-2">
      {(['polite', 'assertive'] as const).map((politeness) => (
        <div
          key={politeness}
          role={politeness === 'assertive' ? 'alert' : 'status'}
          aria-live={politeness}
          aria-atomic="false"
          className="flex flex-col gap-2"
        >
          {toasts
            .filter((toast) => (toast.type === 'error') === (politeness === 'assertive'))
            .map((toast) => (
              <div
                key={toast.id}
                className={`font-ui pointer-events-auto animate-fade-in flex items-center gap-3 rounded border bg-[var(--color-surface-raised)] py-2 pl-4 pr-2 text-xs shadow-lg ${TYPE_STYLES[toast.type]}`}
              >
                <span>{toast.message}</span>
                {/* A real button, not a clickable div: dismissing a message that stays until you
                    dismiss it has to be reachable from the keyboard. */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label={`Dismiss: ${toast.message}`}
                  className="shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <XIcon size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
