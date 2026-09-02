import { useEffect, useRef, useState } from 'react'
import { CheckIcon, MonitorIcon } from '@phosphor-icons/react'
import type { Theme } from '@/types/models'
import { SectionLabel } from '@/components/shared/SectionLabel'
import {
  ALL_THEMES,
  THEME_META,
  getEffectiveTheme,
  isLightEffectiveTheme,
  setThemeClass,
} from '@/lib/theme'
import type { EffectiveTheme } from '@/lib/theme'

const COLS = 3

const DARK_THEMES = ALL_THEMES.filter((t) => !isLightEffectiveTheme(t))
const LIGHT_THEMES = ALL_THEMES.filter((t) => isLightEffectiveTheme(t))

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

// One flat grid model spanning "System" (its own single-cell row) followed by
// the Dark section rows, then the Light section rows. Up/Down travel between
// rows (clamping column to the target row's length); Left/Right travel the
// flattened reading order. This lets arrow keys move seamlessly from System
// into Dark into Light without the caller having to think about section
// boundaries.
const ROWS: Theme[][] = [['system'], ...chunk(DARK_THEMES, COLS), ...chunk(LIGHT_THEMES, COLS)]
const FLAT: Theme[] = ROWS.flat()

function findPosition(theme: Theme): { row: number; col: number } {
  for (let row = 0; row < ROWS.length; row++) {
    const col = (ROWS[row] ?? []).indexOf(theme)
    if (col !== -1) return { row, col }
  }
  return { row: 0, col: 0 }
}

const FIRST_THEME: Theme = FLAT[0] ?? 'system'
const LAST_THEME: Theme = FLAT[FLAT.length - 1] ?? 'system'

// Renders a miniature preview of `effective`'s own tokens by applying the
// theme's CSS class to a scoped wrapper — the same class tokens.css defines
// for the real <html> element, just scoped to this swatch instead. No JS
// color values are read or hardcoded; the browser resolves var(--color-*)
// against whichever class is nearest.
//
// The bands mirror the real shell — title bar, sidebar rail, tab strip with one
// active tab, content, status bar — rather than the three abstract blocks that
// were here before. What a user is choosing is how the app will look, and three
// blocks could not answer the questions that actually decide it: whether this
// theme's surface separates from its background at all, whether its accent
// survives against its own active tab, and how loud its borders are. All three
// are legible here and none were before.
//
// `className` replaces the default rather than appending to it, so a caller
// overriding the height (SystemSwatch's half-width split) doesn't end up with
// two competing height utilities whose winner depends on Tailwind's emit order.
function Swatch({
  effective,
  className = 'h-12',
}: {
  effective: EffectiveTheme
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-theme-preview={effective}
      className={`${effective} flex flex-col overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] ${className}`}
    >
      {/* Title bar */}
      <span className="flex h-[5px] shrink-0 items-center gap-[2px] border-b border-[var(--color-border)] bg-[var(--color-surface)] pl-[3px]">
        <span className="h-[2px] w-[2px] rounded-full bg-[var(--color-text-muted)]" />
        <span className="h-[2px] w-[2px] rounded-full bg-[var(--color-text-muted)]" />
      </span>

      <span className="flex min-h-0 flex-1">
        {/* Sidebar rail, with the active item accented as it is in the real one */}
        <span className="flex w-[9px] shrink-0 flex-col items-center gap-[3px] border-r border-[var(--color-border)] bg-[var(--color-surface)] pt-[4px]">
          <span className="h-[2px] w-[5px] rounded-full bg-[var(--color-accent)]" />
          <span className="h-[2px] w-[5px] rounded-full bg-[var(--color-text-muted)]" />
          <span className="h-[2px] w-[5px] rounded-full bg-[var(--color-text-muted)]" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          {/* Tab strip. The active tab sits on --color-bg under an accent underline,
              which is the one place a theme's accent has to hold up against its own
              background rather than against its surface. */}
          <span className="flex h-[7px] shrink-0 items-end gap-[2px] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-[2px]">
            <span className="h-[6px] w-[12px] rounded-t-[2px] border-b border-[var(--color-accent)] bg-[var(--color-bg)]" />
            <span className="h-[4px] w-[9px] rounded-t-[2px] border border-b-0 border-[var(--color-border)]" />
          </span>

          {/* Content */}
          <span className="flex min-h-0 flex-1 flex-col justify-center gap-[3px] px-[4px]">
            <span className="h-[2px] w-[70%] rounded-full bg-[var(--color-text)] opacity-70" />
            <span className="h-[2px] w-[42%] rounded-full bg-[var(--color-accent)]" />
            <span className="h-[2px] w-[58%] rounded-full bg-[var(--color-text)] opacity-40" />
          </span>
        </span>
      </span>

      {/* Status bar */}
      <span className="h-[4px] shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]" />
    </span>
  )
}

function SystemSwatch() {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-12 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]"
    >
      <Swatch effective="midnight" className="h-full w-1/2 rounded-none border-0" />
      <Swatch effective="soft-focus" className="h-full w-1/2 rounded-none border-0" />
      <span className="absolute inset-0 flex items-center justify-center bg-[var(--color-scrim)]">
        <MonitorIcon size={12} weight="bold" className="text-[var(--color-text)] drop-shadow" />
      </span>
    </span>
  )
}

type ChipProps = {
  theme: Theme
  label: string
  selected: boolean
  tabbable: boolean
  registerRef: (el: HTMLButtonElement | null) => void
  onCommit: () => void
  onHover: (hovering: boolean) => void
  onFocusChange: (focused: boolean) => void
  onArrow: (key: string) => void
}

function ThemeChip({
  theme,
  label,
  selected,
  tabbable,
  registerRef,
  onCommit,
  onHover,
  onFocusChange,
  onArrow,
}: ChipProps) {
  return (
    <button
      type="button"
      ref={registerRef}
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={onCommit}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCommit()
          return
        }
        if (
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'Home' ||
          e.key === 'End'
        ) {
          e.preventDefault()
          onArrow(e.key)
        }
      }}
      className="font-ui flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-left outline-none transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)]"
    >
      <span className="relative">
        {theme === 'system' ? <SystemSwatch /> : <Swatch effective={getEffectiveTheme(theme)} />}
        {selected && (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)]"
          >
            <CheckIcon size={12} weight="bold" />
          </span>
        )}
      </span>
      <span className="truncate text-2xs text-[var(--color-text)]">{label}</span>
    </button>
  )
}

function applyPreviewClass(theme: Theme): void {
  // Same class swap (and same cross-fade) the committed path uses, minus the
  // localStorage write — a preview must not survive the window closing.
  setThemeClass(getEffectiveTheme(theme))
}

export type ThemePickerProps = {
  value: Theme
  onChange: (theme: Theme) => void
}

// role="listbox" + role="option" with manual activation (not "selection
// follows focus"): arrow keys only move the roving-tabindex focus and update
// a live class-only preview; aria-selected stays pinned to the committed
// value until Enter/Space/click explicitly activates a chip. A radiogroup
// (the pattern this codebase already uses in SegmentedControl) implies
// native <input type="radio"> semantics where arrow movement itself changes
// the selection — the opposite of what preview-then-commit needs here, so
// listbox's manual-activation variant is the closer fit.
export function ThemePicker({ value, onChange }: ThemePickerProps) {
  const [hovered, setHovered] = useState<Theme | null>(null)
  const [focused, setFocused] = useState<Theme | null>(null)
  const refs = useRef(new Map<Theme, HTMLButtonElement>())
  const valueRef = useRef(value)
  valueRef.current = value

  const preview = hovered ?? focused ?? value
  // Class-only preview: swaps the <html> theme class for a live look without
  // touching localStorage's theme-cache (read synchronously at boot — see
  // index.html) or the settings DB. Only onChange (click/Enter/Space) goes
  // through the store's update(), which is what persists. Runs as an effect
  // (not inline in render) so it stays a commit-phase side effect rather
  // than a render-phase DOM mutation.
  useEffect(() => {
    applyPreviewClass(preview)
  }, [preview])

  // On unmount, make sure the committed theme (not a lingering hover/focus
  // preview) is what's left applied to <html>. Reads valueRef so this always
  // reverts to the latest committed value even though the effect itself only
  // runs once.
  useEffect(() => {
    return () => applyPreviewClass(valueRef.current)
  }, [])

  const focusTheme = (theme: Theme) => {
    refs.current.get(theme)?.focus()
  }

  const handleArrow = (from: Theme, key: string) => {
    if (key === 'Home') {
      focusTheme(FIRST_THEME)
      return
    }
    if (key === 'End') {
      focusTheme(LAST_THEME)
      return
    }
    const { row, col } = findPosition(from)
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const flatIdx = FLAT.indexOf(from)
      const nextIdx =
        key === 'ArrowLeft' ? Math.max(0, flatIdx - 1) : Math.min(FLAT.length - 1, flatIdx + 1)
      focusTheme(FLAT[nextIdx] ?? from)
      return
    }
    const targetRow = key === 'ArrowUp' ? row - 1 : row + 1
    if (targetRow < 0 || targetRow >= ROWS.length) return
    const targetRowItems = ROWS[targetRow] ?? []
    const targetCol = Math.min(col, targetRowItems.length - 1)
    const target = targetRowItems[targetCol]
    if (target) focusTheme(target)
  }

  const renderChip = (theme: Theme) => (
    <ThemeChip
      key={theme}
      theme={theme}
      label={theme === 'system' ? 'System' : THEME_META[theme].fullLabel}
      selected={theme === value}
      tabbable={theme === (focused ?? value)}
      registerRef={(el) => {
        if (el) refs.current.set(theme, el)
        else refs.current.delete(theme)
      }}
      onCommit={() => onChange(theme)}
      onHover={(hovering) =>
        setHovered((prev) => (hovering ? theme : prev === theme ? null : prev))
      }
      onFocusChange={(isFocused) =>
        setFocused((prev) => (isFocused ? theme : prev === theme ? null : prev))
      }
      onArrow={(key) => handleArrow(theme, key)}
    />
  )

  // No aria-orientation on the listbox: this grid navigates in both axes
  // (Left/Right along reading order, Up/Down between rows), so neither value
  // describes it honestly.
  return (
    <div role="listbox" aria-label="Theme" className="flex flex-col gap-3">
      <div>{renderChip('system')}</div>

      <div role="group" aria-labelledby="theme-group-dark">
        <SectionLabel as="h5" id="theme-group-dark" className="mb-1.5">
          Dark
        </SectionLabel>
        <div className="grid grid-cols-3 gap-2">{DARK_THEMES.map(renderChip)}</div>
      </div>

      <div role="group" aria-labelledby="theme-group-light">
        <SectionLabel as="h5" id="theme-group-light" className="mb-1.5">
          Light
        </SectionLabel>
        <div className="grid grid-cols-3 gap-2">{LIGHT_THEMES.map(renderChip)}</div>
      </div>
    </div>
  )
}
