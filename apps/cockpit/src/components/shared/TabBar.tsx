import { useRef, type ReactNode } from 'react'

type Tab = {
  id: string
  label: string
  /** Optional leading glyph. Decorative — the label is what names the tab. */
  icon?: ReactNode
  disabled?: boolean
}

/**
 * Ids for the tab/panel relationship. Panels are rendered by the consumer, outside this
 * primitive, so both sides derive their ids from the same `baseId` rather than from a
 * `useId` nobody else can see.
 */
export function tabButtonId(baseId: string, tabId: string): string {
  return `${baseId}-tab-${tabId}`
}

export function tabPanelId(baseId: string, tabId: string): string {
  return `${baseId}-panel-${tabId}`
}

/**
 * The panel a tab controls. `tabIndex={0}` because the panel is the next stop after the tab
 * strip, and content that scrolls has to be reachable by keyboard.
 */
export function TabPanel({
  baseId,
  tabId,
  children,
  className = '',
}: {
  baseId: string
  tabId: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(baseId, tabId)}
      aria-labelledby={tabButtonId(baseId, tabId)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  )
}

type TabBarProps = {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  /** Pass true when the parent container already provides the bottom border. */
  noBorder?: boolean
  /**
   * Links each tab to the panel it controls. Pass it together with a `TabPanel` per tab;
   * omitted, the tabs carry no `aria-controls` rather than pointing at ids that don't exist.
   */
  baseId?: string
  'aria-label'?: string
  className?: string
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  noBorder,
  baseId,
  className = '',
  'aria-label': ariaLabel = 'Tool sections',
}: TabBarProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>())

  const selectAndFocus = (startIndex: number, direction: 1 | -1) => {
    if (tabs.length === 0) return
    for (let offset = 0; offset < tabs.length; offset += 1) {
      const index = (startIndex + offset * direction + tabs.length) % tabs.length
      const tab = tabs[index]
      if (tab && !tab.disabled) {
        onTabChange(tab.id)
        buttonRefs.current.get(tab.id)?.focus()
        return
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectAndFocus(index + 1, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectAndFocus(index - 1, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectAndFocus(0, 1)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectAndFocus(tabs.length - 1, -1)
    }
  }
  // Tab switching via Cmd+1/2/3 is handled globally in useGlobalShortcuts
  // via the 'switch-tab' tool action — no duplicate registration here.

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex min-w-0 overflow-x-auto ${noBorder ? '' : 'border-b border-[var(--color-border)]'} ${className}`}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            if (element) buttonRefs.current.set(tab.id, element)
            else buttonRefs.current.delete(tab.id)
          }}
          type="button"
          role="tab"
          {...(baseId
            ? { id: tabButtonId(baseId, tab.id), 'aria-controls': tabPanelId(baseId, tab.id) }
            : {})}
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-xs transition-colors duration-[var(--duration-fast)] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            activeTab === tab.id
              ? 'border-b-2 border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30 font-bold text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
