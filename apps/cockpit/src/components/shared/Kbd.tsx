import { usePlatform } from '@/hooks/usePlatform'

type KbdProps = {
  /**
   * Combo in the same notation as `useKeyboardShortcut`: `mod+enter`, `shift+alt+f`, `escape`.
   * `mod` renders ⌘ on macOS and Ctrl elsewhere, so a hint can't drift from the binding it
   * describes the way a hardcoded "⌘↵" string does on Windows.
   */
  keys: string
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
export function Kbd({ keys, className = '' }: KbdProps) {
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

  return (
    <kbd
      className={`font-mono inline-flex shrink-0 items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-2xs text-[var(--color-text-muted)] ${className}`}
    >
      {label}
    </kbd>
  )
}
