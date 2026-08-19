import { usePlatform } from '@/hooks/usePlatform'
import { formatShortcut } from '@/lib/shortcut-label'

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

/**
 * A keyboard hint.
 *
 * Replaces three competing treatments: bare muted spans in the tools, and two `<kbd>` copies in
 * the shell that disagreed on font size (10px vs 11px, both off the type scale).
 */
export function Kbd({ keys, variant = 'boxed', className = '' }: KbdProps) {
  const { isMac } = usePlatform()

  const label = formatShortcut(keys, isMac)

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
