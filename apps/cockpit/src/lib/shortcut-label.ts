import { detectPlatform } from './platform'

// ⌘↵ and ⇧ are the idiom every Mac user already reads without thinking. Off macOS they are not:
// ⇧ and ↵ aren't printed on a PC keyboard, so "Ctrl+⇧+D" asks the reader to decode a symbol their
// hardware never showed them. Two maps, one per convention.
const MAC_SYMBOLS: Record<string, string> = {
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

const PC_NAMES: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Ctrl',
  meta: 'Win',
  backspace: 'Backspace',
  delete: 'Del',
  tab: 'Tab',
  space: 'Space',
  // Arrows survive the switch — they're printed on every keyboard.
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/**
 * Renders a `useKeyboardShortcut` combo (`mod+enter`, `shift+alt+f`) as display text.
 *
 * `Kbd` is the component form, for a hint that stands beside a control. This is the string form,
 * for the places a component can't go: `title=` tooltips, `aria-label`s, and `EmptyState`
 * descriptions. Both resolve `mod` the same way, so a tooltip can't claim ⌘ on a Windows machine
 * while the `<kbd>` next to it says Ctrl — which is exactly what the hardcoded literals did.
 */
export function formatShortcut(keys: string, isMac = detectPlatform() === 'mac'): string {
  const names = isMac ? MAC_SYMBOLS : PC_NAMES

  return (
    keys
      .split('+')
      .map((raw) => {
        const key = raw.trim().toLowerCase()
        if (key === 'mod') return isMac ? '⌘' : 'Ctrl'
        const symbol = names[key]
        if (symbol) return symbol
        return key.length === 1 ? key.toUpperCase() : raw.trim()
      })
      // No separator on macOS, where modifiers are conventionally run together (⌘⇧P), but a
      // separator elsewhere, where they aren't (Ctrl+Shift+P).
      .join(isMac ? '' : '+')
  )
}
