import { CornersInIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react'
import { useWindowControls } from '@/hooks/useWindowControls'

const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

/** Standard Windows 11 "close" red — a fixed reference colour, not a theme token. */
const WINDOWS_CLOSE_HOVER = '#e81123'

/**
 * Minimize, maximize and close buttons for the undecorated Windows and Linux frame.
 *
 * macOS never renders these. That window keeps its AppKit frame and shows the real traffic lights,
 * which carry the hover menu, Option-click zoom and fullscreen behaviour no drawn copy can
 * reproduce. `TitleBar` is the one place that decides, and reserves the leading space for them.
 */
export function WindowControls() {
  const { isMaximized, minimize, toggleMaximize, close } = useWindowControls()
  return (
    <div className="flex h-8 items-stretch" role="group" aria-label="Window controls">
      <button
        type="button"
        aria-label="Minimize"
        onClick={minimize}
        className={`flex h-8 w-[46px] items-center justify-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] ${FOCUS_RING}`}
      >
        <MinusIcon size={14} />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={toggleMaximize}
        className={`flex h-8 w-[46px] items-center justify-center text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)] ${FOCUS_RING}`}
      >
        {isMaximized ? <CornersInIcon size={14} /> : <SquareIcon size={12} />}
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className={`flex h-8 w-[46px] items-center justify-center text-[var(--color-text)] transition-colors hover:text-white ${FOCUS_RING}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = WINDOWS_CLOSE_HOVER
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = ''
        }}
      >
        <XIcon size={14} />
      </button>
    </div>
  )
}
