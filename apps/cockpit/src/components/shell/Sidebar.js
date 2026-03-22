import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TOOL_GROUPS } from '@/types/tools';
import { TOOLS } from '@/app/tool-registry';
import { useSettingsStore } from '@/stores/settings.store';
import { SidebarGroup } from './SidebarGroup';
export function Sidebar() {
    const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
    if (sidebarCollapsed) {
        return (_jsx("aside", { className: "flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2", children: TOOL_GROUPS.map((group) => (_jsx("div", { className: "mb-2 flex h-7 w-7 items-center justify-center font-pixel text-[10px] text-[var(--color-text-muted)]", title: group.label, children: group.icon }, group.id))) }));
    }
    return (_jsxs("aside", { className: "flex w-52 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] py-2", children: [_jsx("div", { className: "mb-3 px-3", children: _jsx("h1", { className: "font-pixel text-sm text-[var(--color-accent)]", children: "devdrivr" }) }), TOOL_GROUPS.map((group) => {
                const tools = TOOLS.filter((t) => t.group === group.id);
                return _jsx(SidebarGroup, { group: group, tools: tools }, group.id);
            })] }));
}
