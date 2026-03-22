import { jsx as _jsx } from "react/jsx-runtime";
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
import { useCallback } from 'react';
export function TabBar({ tabs, activeTab, onTabChange }) {
    const switchTab = useCallback((index) => {
        const tab = tabs[index];
        if (tab)
            onTabChange(tab.id);
    }, [tabs, onTabChange]);
    useKeyboardShortcut({ key: '1', mod: true }, () => switchTab(0));
    useKeyboardShortcut({ key: '2', mod: true }, () => switchTab(1));
    useKeyboardShortcut({ key: '3', mod: true }, () => switchTab(2));
    return (_jsx("div", { className: "flex border-b border-[var(--color-border)]", children: tabs.map((tab) => (_jsx("button", { onClick: () => onTabChange(tab.id), className: `px-4 py-2 text-xs ${activeTab === tab.id
                ? 'border-b-2 border-[var(--color-accent)] font-bold text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`, children: tab.label }, tab.id))) }));
}
