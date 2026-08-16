import { useRef } from 'react'

type Tab = {
  id: string
  label: string
  disabled?: boolean
}

type TabBarProps = {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
  /** Pass true when the parent container already provides the bottom border. */
  noBorder?: boolean
  'aria-label'?: string
  className?: string
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  noBorder,
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
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`shrink-0 px-4 py-2 text-xs transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            activeTab === tab.id
              ? 'border-b-2 border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30 font-bold text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
