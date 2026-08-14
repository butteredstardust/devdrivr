import type { ReactNode } from 'react'
import { CornersInIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react'
import { useWindowControls } from '@/hooks/useWindowControls'
import { isMacOS } from '@/lib/platform'

const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]'

/**
 * macOS traffic-light colours (close/minimize/maximize) are a deliberate exact match to the
 * native AppKit palette — they are brand-fixed reference colours, not themeable surfaces, so
 * they are hardcoded here rather than pulled from CSS variables.
 */
const TRAFFIC_LIGHT_COLORS = {
  close: '#ff5f57',
  minimize: '#febc2e',
  maximize: '#28c840',
} as const

/** Standard Windows 11 "close" red — also a fixed reference colour, not a theme token. */
const WINDOWS_CLOSE_HOVER = '#e81123'

export function WindowControls() {
  const controls = useWindowControls()
  return isMacOS() ? <MacTrafficLights {...controls} /> : <WindowsControls {...controls} />
}

interface ControlsProps {
  isMaximized: boolean
  isFocused: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
}

function MacTrafficLights({ isFocused, minimize, toggleMaximize, close }: ControlsProps) {
  const dimmed = !isFocused
  return (
    <div className="group flex items-center gap-2" role="group" aria-label="Window controls">
      <TrafficLight
        label="Close"
        color={TRAFFIC_LIGHT_COLORS.close}
        dimmed={dimmed}
        onClick={close}
        glyph={<XIcon size={8} weight="bold" />}
      />
      <TrafficLight
        label="Minimize"
        color={TRAFFIC_LIGHT_COLORS.minimize}
        dimmed={dimmed}
        onClick={minimize}
        glyph={<MinusIcon size={8} weight="bold" />}
      />
      <TrafficLight
        label="Maximize"
        color={TRAFFIC_LIGHT_COLORS.maximize}
        dimmed={dimmed}
        onClick={toggleMaximize}
        glyph={<CornersInIcon size={8} weight="bold" />}
      />
    </div>
  )
}

function TrafficLight({
  label,
  color,
  dimmed,
  onClick,
  glyph,
}: {
  label: string
  color: string
  dimmed: boolean
  onClick: () => void
  glyph: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-3 w-3 items-center justify-center rounded-full text-black/60 ${FOCUS_RING}`}
      style={{ backgroundColor: dimmed ? 'var(--color-border)' : color }}
    >
      <span className="opacity-0 transition-opacity duration-100 group-hover:opacity-100">
        {glyph}
      </span>
    </button>
  )
}

function WindowsControls({ isMaximized, minimize, toggleMaximize, close }: ControlsProps) {
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
