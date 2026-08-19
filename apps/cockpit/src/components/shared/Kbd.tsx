import { usePlatform } from '@/hooks/usePlatform'

type KbdProps = {
  /**
   * Combo in the same notation as `useKeyboardShortcut`: `mod+enter`, `shift+alt+f`, `escape`.
   * `mod` renders ⌘ on macOS and Ctrl elsewhere, so a hint can't drift from the binding it
   * describes the way a hardcoded "⌘↵" string does on Windows.
   */
  keys: string
  /**
   * `boxed` is the standalone hint — a shortcut listed beside the thing it triggers.
   *
   * `inline` is the hint *inside* the control itself ("Format ⌘↵"), where a border and a surface
   * fill read as a second button nested in the first. It keeps the platform mapping and drops
   * only the chrome, which is the whole reason these sites hardcoded ⌘ and lied on Windows.
   */
  variant?: 'boxed' | 'inline'
  className?: string
}

// Symbols only where they're unambiguous and universally read. "Enter" beats ↵ for a modifier-less
// hint, but ⌘↵ is the idiom every Mac user already knows, so the symbol wins inside a combo.
const KEY_SYMBOLS: Record<string, string> = {
  enter: '↵',
  return: '↵',
  escape: 'Esc',
  esc: 'Esc',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
  ctrl: '⌃',
  control: '⌃',
  cmd: '⌘',
  meta: '⌘',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
  space: 'Space',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/**
 * A keyboard hint.
 *
 * Replaces three competing treatments: bare muted spans in the tools, and two `<kbd>` copies in
 * the shell that disagreed on font size (10px vs 11px, both off the type scale).
 */
export function Kbd({ keys, variant = 'boxed', className = '' }: KbdProps) {
  const { isMac } = usePlatform()

  const label = keys
    .split('+')
    .map((raw) => {
      const key = raw.trim().toLowerCase()
      if (key === 'mod') return isMac ? '⌘' : 'Ctrl'
      const symbol = KEY_SYMBOLS[key]
      if (symbol) return symbol
      return key.length === 1 ? key.toUpperCase() : raw.trim()
    })
    // No separator on macOS, where modifiers are conventionally run together (⌘⇧P), but a
    // separator elsewhere, where they aren't (Ctrl+Shift+P).
    .join(isMac ? '' : '+')

  const chrome =
    variant === 'inline'
      ? 'opacity-70'
      : 'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-text-muted)]'

  return (
    <kbd className={`font-mono inline-flex shrink-0 items-center text-2xs ${chrome} ${className}`}>
      {label}
    </kbd>
  )
}
