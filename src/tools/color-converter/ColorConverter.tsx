import { useCallback, useMemo, useState } from 'react'
import { CheckCircleIcon, PaletteIcon, XCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Panel } from '@/components/shared/Panel'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { DocumentIdentity, DocumentToolbar } from '@/components/shared/Toolbar'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'
import { ContrastChecker } from '@/tools/color-converter/components/ContrastChecker'
import { CssVariableSection } from '@/tools/color-converter/components/CssVariableSection'
import { FormatsSection } from '@/tools/color-converter/components/FormatsSection'
import { HarmonySection } from '@/tools/color-converter/components/HarmonySection'
import { ScaleSection } from '@/tools/color-converter/components/ScaleSection'
import {
  SECTION_OPTIONS,
  apcaContrast,
  contrastRatio,
  findCssName,
  generateScale,
  harmonies,
  labToLch,
  parseColor,
  rgbToHex,
  rgbToHsb,
  rgbToHsl,
  rgbToLab,
  rgbToOklch,
  rgbToOpaqueHex,
  type ColorConverterState,
  type ColorSection,
} from '@/tools/color-converter/color-model'
import { useColorInputHistory } from '@/tools/color-converter/hooks/useColorInputHistory'

// Re-exported because the tests have always reached for these helpers through the tool entry point.
export {
  apcaContrast,
  generateScale,
  labToLch,
  rgbToLab,
} from '@/tools/color-converter/color-model'

// ── Component ────────────────────────────────────────────────────────

export default function ColorConverter() {
  const [state, updateState] = useToolState<ColorConverterState>('color-converter', {
    input: '#39ff14',
    contrastFg: '#ffffff',
    contrastBg: '#000000',
    history: [],
    cssVarName: '--color-primary',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [activeSection, setActiveSection] = useState<ColorSection>('formats')

  const color = useMemo(() => {
    const rgb = parseColor(state.input)
    if (!rgb) return null
    const hsl = rgbToHsl(rgb)
    const hsb = rgbToHsb(rgb)
    const lab = rgbToLab(rgb)
    const lch = labToLch(lab)
    const oklch = rgbToOklch(rgb)
    const alpha = rgb.a ?? 1
    const cssName = alpha === 1 ? findCssName(rgbToOpaqueHex(rgb)) : null
    return {
      rgb,
      hsl,
      hsb,
      lab,
      lch,
      oklch,
      alpha,
      hex: rgbToHex(rgb),
      opaqueHex: rgbToOpaqueHex(rgb),
      cssName,
    }
  }, [state.input])

  const handleInputChange = useColorInputHistory(state.history, updateState)

  const formats = useMemo(() => {
    if (!color) return []
    const alpha = Math.round(color.alpha * 1000) / 1000
    const suffix = alpha < 1 ? ` / ${alpha}` : ''
    return [
      { label: 'Hex', value: color.hex },
      { label: 'RGB', value: `rgb(${color.rgb.r} ${color.rgb.g} ${color.rgb.b}${suffix})` },
      { label: 'HSL', value: `hsl(${color.hsl.h} ${color.hsl.s}% ${color.hsl.l}%${suffix})` },
      { label: 'HSB', value: `hsb(${color.hsb.h} ${color.hsb.s}% ${color.hsb.b}%${suffix})` },
      { label: 'LAB', value: `lab(${color.lab.l}% ${color.lab.a} ${color.lab.b}${suffix})` },
      { label: 'LCH', value: `lch(${color.lch.l}% ${color.lch.c} ${color.lch.h}${suffix})` },
      {
        label: 'OKLCH',
        value: `oklch(${color.oklch.l}% ${color.oklch.c} ${color.oklch.h}${suffix})`,
      },
      ...(color.cssName ? [{ label: 'CSS Name', value: color.cssName }] : []),
    ]
  }, [color])

  const scale = useMemo(() => (color ? generateScale(color.rgb) : []), [color])
  const harmony = useMemo(() => (color ? harmonies(color.rgb) : []), [color])

  const contrast = useMemo(() => {
    const fg = parseColor(state.contrastFg)
    const bg = parseColor(state.contrastBg)
    if (!fg || !bg) return null
    const ratio = contrastRatio(fg, bg)
    const apca = apcaContrast(fg, bg)
    return {
      ratio: ratio.toFixed(2),
      apca: apca.toFixed(1),
      aa: ratio >= 4.5,
      aaLarge: ratio >= 3,
      aaa: ratio >= 7,
    }
  }, [state.contrastFg, state.contrastBg])

  const swapContrast = useCallback(() => {
    updateState({ contrastFg: state.contrastBg, contrastBg: state.contrastFg })
    setLastAction('Swapped contrast colors', 'info')
  }, [state.contrastFg, state.contrastBg, updateState, setLastAction])

  return (
    <ToolLayout
      maxWidth="max-w-4xl"
      toolbar={
        // Same chrome grammar as the document tools: identity on the left, live
        // status beside it. This tool had neither, so a parse failure showed up
        // only as the rest of the page silently not being there.
        <DocumentToolbar aria-label="Color status">
          <DocumentIdentity
            title={color ? (color.cssName ?? color.hex.toUpperCase()) : 'No color'}
            icon={
              color ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded border border-[var(--color-border)]"
                  style={{ backgroundColor: color.hex }}
                />
              ) : (
                <PaletteIcon
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-text-muted)]"
                />
              )
            }
            status={
              color
                ? `${color.hex.toUpperCase()} · ${formats.length} formats`
                : state.input.trim()
                  ? 'Unrecognised color'
                  : 'Enter a color to convert'
            }
            statusTestId="color-status"
            statusIcon={
              color ? (
                <CheckCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-success)]"
                />
              ) : state.input.trim() ? (
                <XCircleIcon
                  size={12}
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-error)]"
                />
              ) : undefined
            }
          />
        </DocumentToolbar>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Input ──────────────────────────────────────── */}
        <Panel title="Color Input" titleId="color-converter-input-label">
          <div className="flex items-center gap-3">
            <Input
              aria-labelledby="color-converter-input-label"
              value={state.input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="#39ff14, rgb(255,0,0), hsl(120,100%,50%), oklch(87% 0.35 145), red"
              monospace
              size="md"
              className="flex-1"
            />
            <input
              type="color"
              value={color?.hex ?? '#000000'}
              onChange={(e) => handleInputChange(e.target.value)}
              title="Pick a color"
              className="h-10 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
            />
            {color && (
              <div
                className="h-10 w-10 shrink-0 rounded border border-[var(--color-border)]"
                style={{ backgroundColor: color.hex }}
                title={color.hex}
              />
            )}
          </div>

          {/* History */}
          {state.history.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-muted)]">Recent:</span>
              {state.history.map((hex) => (
                <Button
                  key={hex}
                  variant="icon"
                  onClick={() => updateState({ input: hex })}
                  className="h-5 w-5 rounded border border-[var(--color-border)] p-0 transition-transform hover:scale-125 hover:bg-transparent"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── Section Tabs ──────────────────────────────── */}
        {color && (
          <>
            <div className="pb-1">
              <SegmentedControl
                aria-label="Color info section"
                options={SECTION_OPTIONS}
                value={activeSection}
                onChange={setActiveSection}
              />
            </div>

            {/* ── Formats ─────────────────────────────────── */}
            {activeSection === 'formats' && <FormatsSection formats={formats} />}

            {/* ── Shades & Tints ──────────────────────────── */}
            {activeSection === 'scale' && (
              <ScaleSection scale={scale} onSelect={(input) => updateState({ input })} />
            )}

            {/* ── Harmony ─────────────────────────────────── */}
            {activeSection === 'harmony' && (
              <HarmonySection harmony={harmony} onSelect={(input) => updateState({ input })} />
            )}

            {/* ── CSS Variable Preview ─────────────────────── */}
            {activeSection === 'cssvar' && (
              <CssVariableSection
                color={color}
                cssVarName={state.cssVarName}
                onNameChange={(cssVarName) => updateState({ cssVarName })}
              />
            )}
          </>
        )}

        {/* ── Contrast Ratio ─────────────────────────────── */}
        <ContrastChecker
          contrastFg={state.contrastFg}
          contrastBg={state.contrastBg}
          contrast={contrast}
          onFgChange={(contrastFg) => updateState({ contrastFg })}
          onBgChange={(contrastBg) => updateState({ contrastBg })}
          onSwap={swapContrast}
        />
      </div>
    </ToolLayout>
  )
}
