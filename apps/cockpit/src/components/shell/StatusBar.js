import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUiStore } from '@/stores/ui.store';
import { useSettingsStore } from '@/stores/settings.store';
import { getToolById } from '@/app/tool-registry';
export function StatusBar() {
    const activeTool = useUiStore((s) => s.activeTool);
    const lastAction = useUiStore((s) => s.lastAction);
    const toggleTheme = useSettingsStore((s) => s.toggleTheme);
    const theme = useSettingsStore((s) => s.theme);
    const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
    const tool = getToolById(activeTool);
    const actionColor = lastAction?.type === 'error'
        ? 'text-[var(--color-error)]'
        : lastAction?.type === 'success'
            ? 'text-[var(--color-success)]'
            : 'text-[var(--color-text-muted)]';
    return (_jsxs("div", { className: "flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px]", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: tool?.name ?? '' }), lastAction && (_jsx("span", { className: actionColor, children: lastAction.message }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [alwaysOnTop && (_jsx("span", { className: "text-[var(--color-accent)]", title: "Always on top", children: "\uD83D\uDCCC" })), _jsx("button", { onClick: toggleTheme, className: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]", title: `Theme: ${theme}`, children: theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚙️' })] })] }));
}
