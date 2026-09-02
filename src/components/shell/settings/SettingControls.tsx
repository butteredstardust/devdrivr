import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircleIcon, SpinnerIcon, WarningIcon } from '@phosphor-icons/react'
import { ControlLabelProvider, useControlLabelId } from '@/components/shared/ControlLabel'
import { Select } from '@/components/shared/Select'
import { useUiStore } from '@/stores/ui.store'

/**
 * The controls the four settings tabs are built out of.
 *
 * Extracted from `SettingsPanel` when that file reached 1,285 lines and held pure helpers,
 * persistence, four unrelated tab bodies and the panel shell in one module. Nothing here changed
 * shape in the move.
 */

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
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex flex-col">
        <span id={labelId} className="text-xs text-[var(--color-text)]">
          {label}
        </span>
        {hint && <span className="text-2xs text-[var(--color-text-muted)]">{hint}</span>}
      </div>
      {/* The row's label names its control. Without this every switch here is a
          `<button role="switch">` sitting next to unrelated text — announced as
          an unnamed button, so arrowing through Settings reads as "switch, on"
          over and over. Toggle and SelectInput pick the id up from context, so
          no call site below repeats the label as an aria-label. */}
      <ControlLabelProvider id={labelId}>
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
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-labelledby={labelId}
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

export function DangerButton({
  label,
  confirmLabel,
  onConfirm,
  icon,
  successMessage,
  errorMessage,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  icon: React.ReactNode
  successMessage: string
  errorMessage: string
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
        disabled
        className="flex items-center gap-1.5 rounded border border-[var(--color-success)] px-2.5 py-1.5 text-xs text-[var(--color-success)]"
      >
        <CheckCircleIcon size={12} />
        Done
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleClick()
      }}
      disabled={pending}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
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

export function StatCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-center">
      <div className="text-sm font-bold tabular-nums text-[var(--color-text)]">{count}</div>
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
    </div>
  )
}
