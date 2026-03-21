import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useCallback } from 'react'

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
  const switchTab = useCallback(
    (index: number) => {
      const tab = tabs[index]
      if (tab) onTabChange(tab.id)
    },
    [tabs, onTabChange]
  )

  useKeyboardShortcut({ key: '1', mod: true }, () => switchTab(0))
  useKeyboardShortcut({ key: '2', mod: true }, () => switchTab(1))
  useKeyboardShortcut({ key: '3', mod: true }, () => switchTab(2))

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
