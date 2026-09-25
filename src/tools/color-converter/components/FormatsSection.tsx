import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

type Format = { label: string; value: string }

/**
 * One `LABEL: value` row in the Formats section.
 *
 * Make the whole row the copy target so its label and value identify the action. Replace the
 * trailing icon in place so the row does not reflow.
 */
function FormatRow({ label, value }: Format) {
  const [copied, setCopied] = useState(false)
  const copy = useCopyToClipboard()

  async function handleCopy() {
    if (!(await copy(value))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    /* A clickable row, not a button: no Button variant expresses a bordered surface panel with
     * justify-between content, and overriding one's padding and background via className would
     * fight the primitive rather than use it. */
    // eslint-disable-next-line no-restricted-syntax -- clickable row, see above
    <button
      type="button"
      onClick={() => {
        void handleCopy()
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label} value ${value}`}
      className="group flex w-full items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <div>
        <span className="text-xs text-[var(--color-text-muted)]">{label}: </span>
        <span className="font-mono text-sm text-[var(--color-text)]">{value}</span>
      </div>
      {copied ? (
        <CheckIcon
          size={14}
          weight="bold"
          aria-hidden="true"
          className="shrink-0 text-[var(--color-success)]"
        />
      ) : (
        <CopyIcon
          size={14}
          aria-hidden="true"
          className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      )}
    </button>
  )
}

export function FormatsSection({ formats }: { formats: Format[] }) {
  return (
    <section className="flex flex-col gap-2">
      {formats.map((format) => (
        <FormatRow key={format.label} label={format.label} value={format.value} />
      ))}
    </section>
  )
}
