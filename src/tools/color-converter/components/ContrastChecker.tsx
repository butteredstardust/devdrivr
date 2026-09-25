import { useMemo } from 'react'
import { ArrowsLeftRightIcon, CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/shared/Input'
import { Panel } from '@/components/shared/Panel'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { parseColor, rgbToOpaqueHex } from '@/tools/color-converter/color-model'

type ContrastResult = {
  ratio: string
  apca: string
  aa: boolean
  aaLarge: boolean
  aaa: boolean
}

// ── Contrast Inputs (avoids double parseColor calls) ─────────────────

function ContrastInputs({
  contrastFg,
  contrastBg,
  onFgChange,
  onBgChange,
  onSwap,
}: {
  contrastFg: string
  contrastBg: string
  onFgChange: (v: string) => void
  onBgChange: (v: string) => void
  onSwap: () => void
}) {
  const fgRgb = useMemo(() => parseColor(contrastFg), [contrastFg])
  const bgRgb = useMemo(() => parseColor(contrastBg), [contrastBg])
  const fgHex = fgRgb ? rgbToOpaqueHex(fgRgb) : '#ffffff'
  const bgHex = bgRgb ? rgbToOpaqueHex(bgRgb) : '#000000'

  return (
    <div className="flex items-end gap-4">
      {/* Explicit htmlFor: the colour swatch shares the row, so a wrapping label would
          forward clicks to it rather than to the text field. */}
      <Field label="Foreground" htmlFor="contrast-fg" className="flex-1">
        <div className="flex items-center gap-2">
          <Input
            id="contrast-fg"
            monospace
            value={contrastFg}
            onChange={(e) => onFgChange(e.target.value)}
            size="md"
            className="flex-1"
          />
          <input
            type="color"
            aria-label="Pick a foreground color"
            value={fgHex}
            onChange={(e) => onFgChange(e.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        </div>
      </Field>
      <Button
        variant="secondary"
        size="sm"
        onClick={onSwap}
        className="mb-1"
        title="Swap foreground and background"
      >
        <ArrowsLeftRightIcon size={14} aria-hidden="true" />
        <span className="sr-only">Swap colors</span>
      </Button>
      <Field label="Background" htmlFor="contrast-bg" className="flex-1">
        <div className="flex items-center gap-2">
          <Input
            id="contrast-bg"
            monospace
            value={contrastBg}
            onChange={(e) => onBgChange(e.target.value)}
            size="md"
            className="flex-1"
          />
          <input
            type="color"
            aria-label="Pick a background color"
            value={bgHex}
            onChange={(e) => onBgChange(e.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        </div>
      </Field>
    </div>
  )
}

export function ContrastChecker({
  contrastFg,
  contrastBg,
  contrast,
  onFgChange,
  onBgChange,
  onSwap,
}: {
  contrastFg: string
  contrastBg: string
  contrast: ContrastResult | null
  onFgChange: (value: string) => void
  onBgChange: (value: string) => void
  onSwap: () => void
}) {
  return (
    <Panel title="Contrast Ratio (WCAG)">
      <ContrastInputs
        contrastFg={contrastFg}
        contrastBg={contrastBg}
        onFgChange={onFgChange}
        onBgChange={onBgChange}
        onSwap={onSwap}
      />
      {contrast && (
        <div className="mt-3 flex items-center gap-4">
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2">
            <div className="text-xs text-[var(--color-text-muted)]">Ratio</div>
            <div className="font-mono text-lg font-bold text-[var(--color-text)]">
              {contrast.ratio}:1
            </div>
          </div>
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2">
            <div className="text-xs text-[var(--color-text-muted)]">APCA Lc</div>
            <div className="font-mono text-lg font-bold text-[var(--color-text)]">
              {contrast.apca}
            </div>
          </div>
          <div
            className="flex h-12 items-center justify-center rounded border border-[var(--color-border)] px-6 text-sm font-bold"
            style={{ backgroundColor: contrastBg, color: contrastFg }}
          >
            Sample Text
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { passes: contrast.aa, label: 'AA Normal (≥4.5)' },
              { passes: contrast.aaLarge, label: 'AA Large (≥3.0)' },
              { passes: contrast.aaa, label: 'AAA (≥7.0)' },
            ].map(({ passes, label }) => (
              <StatusBadge key={label} variant={passes ? 'success' : 'error'}>
                {passes ? (
                  <CheckCircleIcon size={12} weight="fill" aria-hidden="true" />
                ) : (
                  <XCircleIcon size={12} weight="fill" aria-hidden="true" />
                )}
                {label}
              </StatusBadge>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
