type Tab = {
  id: string
  label: string
}

type TabBarProps = {
  tabs: Tab[]
  activeTab: string
  onTabChange: (tabId: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  // Tab switching via Cmd+1/2/3 is handled globally in useGlobalShortcuts
  // via the 'switch-tab' tool action — no duplicate registration here.

  return (
    <div className="flex border-b border-[var(--color-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-xs ${
            activeTab === tab.id
              ? 'border-b-2 border-[var(--color-accent)] font-bold text-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
