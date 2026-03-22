import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUiStore } from '@/stores/ui.store';
export function SidebarItem({ id, name, icon }) {
    const activeTool = useUiStore((s) => s.activeTool);
    const setActiveTool = useUiStore((s) => s.setActiveTool);
    const isActive = activeTool === id;
    return (_jsxs("button", { onClick: () => setActiveTool(id), title: name, className: `flex h-9 w-full items-center gap-2 rounded-sm px-2 text-xs transition-colors ${isActive
            ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'}`, children: [_jsx("span", { className: "w-5 shrink-0 text-center font-pixel text-[10px]", children: icon }), _jsx("span", { className: "truncate", children: name })] }));
}
