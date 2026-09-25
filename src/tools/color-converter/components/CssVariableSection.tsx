import { CopyButton } from '@/components/shared/CopyButton'
import { Input } from '@/components/shared/Input'
import type { HSL, RGB } from '@/tools/color-converter/color-model'

type CssVariableColor = {
  rgb: RGB
  hsl: HSL
  oklch: { l: number; c: number; h: number }
  hex: string
  opaqueHex: string
}

export function CssVariableSection({
  color,
  cssVarName,
  onNameChange,
}: {
  color: CssVariableColor
  cssVarName: string
  onNameChange: (value: string) => void
}) {
  return (
    <section className="flex flex-col gap-4">
      {/* Variable name input */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="css-var-name"
          className="font-ui shrink-0 text-xs text-[var(--color-text-muted)]"
        >
          Variable name
        </label>
        <Input
          id="css-var-name"
          value={cssVarName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="--color-primary"
          className="flex-1 font-mono"
        />
      </div>

      {/* Declarations to copy */}
      <div className="flex flex-col gap-2">
        {[
          { label: 'Hex', value: `${cssVarName}: ${color.hex};` },
          {
            label: 'RGB',
            value: `${cssVarName}: rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b});`,
          },
          {
            label: 'HSL',
            value: `${cssVarName}: hsl(${color.hsl.h}, ${color.hsl.s}%, ${color.hsl.l}%);`,
          },
          {
            label: 'OKLCH',
            value: `${cssVarName}: oklch(${color.oklch.l}% ${color.oklch.c} ${color.oklch.h});`,
          },
        ].map((declaration) => (
          <div
            key={declaration.label}
            className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <div>
              <span className="text-xs text-[var(--color-text-muted)]">{declaration.label}: </span>
              <span className="font-mono text-sm text-[var(--color-text)]">
                {declaration.value}
              </span>
            </div>
            <CopyButton text={declaration.value} />
          </div>
        ))}
      </div>

      {/* Live UI mockup */}
      <div>
        <div className="mb-2 text-xs text-[var(--color-text-muted)]">Preview</div>
        <div className="flex flex-wrap items-center gap-3 rounded border border-[var(--color-border)] p-4">
          {/* Surface swatch */}
          <div
            className="flex h-10 w-24 items-center justify-center rounded border border-[var(--color-border)] font-mono text-xs"
            style={{
              backgroundColor: color.hex,
              color: color.oklch.l > 55 ? '#000' : '#fff',
            }}
          >
            surface
          </div>
          {/* Button */}
          {/* eslint-disable-next-line no-restricted-syntax -- decorative sample in the
              UI-mockup panel: it has no onClick and exists to show the picked colour
              as a button fill, so it must not inherit the app's own button styling. */}
          <button
            className="rounded px-3 py-1.5 text-xs font-bold"
            style={{
              backgroundColor: color.hex,
              color: color.oklch.l > 55 ? '#000' : '#fff',
            }}
          >
            Button
          </button>
          {/* Badge */}
          <span
            className="rounded-full px-2 py-0.5 text-2xs font-bold"
            style={{ backgroundColor: color.opaqueHex + '33', color: color.hex }}
          >
            Badge
          </span>
          {/* Text */}
          <span className="text-sm font-bold" style={{ color: color.hex }}>
            Text color
          </span>
          {/* Border sample */}
          <div
            className="h-10 w-10 rounded"
            style={{ border: `2px solid ${color.hex}` }}
            title="border color"
          />
        </div>
      </div>
    </section>
  )
}
