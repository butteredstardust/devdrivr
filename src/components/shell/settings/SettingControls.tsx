import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircleIcon, SpinnerIcon, WarningIcon } from '@phosphor-icons/react'
import {
  ControlLabelProvider,
  useControlDescriptionId,
  useControlLabelId,
} from '@/components/shared/ControlLabel'
import { Input } from '@/components/shared/Input'
import { Select } from '@/components/shared/Select'
import { useUiStore } from '@/stores/ui.store'

/** Shared controls keep all settings tabs consistent and accessible. */

export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  const labelId = useId()
  const hintId = useId()
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span id={labelId} className="text-xs text-[var(--color-text)]">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="text-2xs text-[var(--color-text-muted)]">
            {hint}
          </span>
        )}
      </div>
      {/* The row's label names its control. Without this every switch here is a
          `<button role="switch">` sitting next to unrelated text — announced as
          an unnamed button, so arrowing through Settings reads as "switch, on"
          over and over. Toggle and SelectInput pick the id up from context, so
          no call site below repeats the label as an aria-label. */}
      <ControlLabelProvider id={labelId} descriptionId={hint ? hintId : undefined}>
        <div className="flex items-center">{children}</div>
      </ControlLabelProvider>
    </div>
  )
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string | number
  onChange: (v: string) => void
  options: { value: string | number; label: string }[]
}) {
  const labelId = useControlLabelId()
  const descriptionId = useControlDescriptionId()
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className="bg-[var(--color-bg)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  )
}

export function NumericSettingInput({
  value,
  min,
  max,
  clamp,
  unit,
  onCommit,
}: {
  value: number
  min: number
  max: number
  clamp: (value: number) => number
  unit: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  // A change from elsewhere — a resize handle, an import, a reset — refreshes the draft. Writing
  // to the DOM node here is `Input`'s job, and it skips the write while the field has focus:
  // retargeting a focused input drops WKWebView's first responder mid-entry.
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  // An empty or non-numeric field restores the stored value. Clamping it instead would read a
  // cleared field as `0` and commit the minimum.
  const commit = () => {
    const trimmed = draft.trim()
    const parsed = Number(trimmed)
    const next = trimmed !== '' && Number.isFinite(parsed) ? clamp(parsed) : value
    setDraft(String(next))
    onCommit(next)
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          // Escape discards the draft. The field still holds focus, so `Input` will not sync the
          // DOM node for us — this one write has to be direct.
          if (event.key === 'Escape') {
            setDraft(String(value))
            event.currentTarget.value = String(value)
          }
        }}
        className="w-20 text-right"
      />
      <span className="text-2xs text-[var(--color-text-muted)]">{unit}</span>
    </div>
  )
}

export function DangerButton({
  label,
  accessibleLabel,
  confirmLabel,
  onConfirm,
  icon,
  successMessage,
  errorMessage,
  disabled = false,
}: {
  label: string
  accessibleLabel?: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  icon: React.ReactNode
  successMessage: string
  errorMessage: string
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const addToast = useUiStore((s) => s.addToast)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 3000)
      return
    }
    clearTimeout(timerRef.current)
    setPending(true)
    try {
      await onConfirm()
      setDone(true)
      addToast(successMessage, 'success')
      timerRef.current = setTimeout(() => setDone(false), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addToast(`${errorMessage}: ${msg}`, 'error')
    } finally {
      setPending(false)
      setConfirming(false)
    }
  }

  if (done) {
    return (
      <button
        type="button"
        aria-label={accessibleLabel}
        disabled
        data-action-slot=""
        className="flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded border border-[var(--color-success)] px-2.5 py-1.5 text-xs text-[var(--color-success)]"
      >
        <CheckCircleIcon size={12} />
        Done
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      data-action-slot=""
      onClick={() => {
        void handleClick()
      }}
      disabled={pending || disabled}
      className={`flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
        confirming
          ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]'
      } disabled:pointer-events-none disabled:opacity-60`}
    >
      {pending ? (
        <SpinnerIcon size={12} className="animate-spin" aria-hidden="true" />
      ) : confirming ? (
        <WarningIcon size={12} aria-hidden="true" />
      ) : (
        icon
      )}
      {pending ? 'Working…' : confirming ? confirmLabel : label}
    </button>
  )
}

/**
 * A non-destructive data action — export or import.
 *
 * Pass `accessibleLabel` whenever the visible text repeats across rows. "Export" on its own names
 * three different buttons in Settings → Data, which reads as one control announced three times.
 */
export function TransferButton({
  label,
  accessibleLabel,
  icon,
  onClick,
  disabled = false,
}: {
  label: string
  accessibleLabel?: string
  icon: React.ReactNode
  onClick: () => Promise<void>
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false)
  const mountedRef = useRef(true)

  // The file dialog outlives a tab switch, so the resolve can land after this button unmounts.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const handleClick = async () => {
    setPending(true)
    try {
      await onClick()
    } finally {
      if (mountedRef.current) setPending(false)
    }
  }

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      data-action-slot=""
      onClick={() => {
        void handleClick()
      }}
      disabled={pending || disabled}
      className="flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-60"
    >
      {pending ? <SpinnerIcon size={12} className="animate-spin" aria-hidden="true" /> : icon}
      {pending ? 'Working…' : label}
    </button>
  )
}

/** One stored dataset with its item count and the actions that move or remove it. */
export function DatasetRow({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-[var(--color-text)]">{label}</span>
        <span className="text-2xs tabular-nums text-[var(--color-text-muted)]">{count} stored</span>
      </div>
      <div
        role="group"
        aria-label={`${label} actions`}
        className="flex flex-wrap items-center gap-2"
      >
        {children}
      </div>
    </div>
  )
}

/** Reserves one unavailable dataset action without adding an interactive control. */
export function ActionSlotSpacer() {
  return <div aria-hidden="true" data-action-slot="" className="min-w-[6.5rem]" />
}
