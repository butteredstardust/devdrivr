import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { SidebarItem } from './SidebarItem';
export function SidebarGroup({ group, tools }) {
    const [collapsed, setCollapsed] = useState(false);
    return (_jsxs("div", { className: "mb-1", children: [_jsxs("button", { onClick: () => setCollapsed(!collapsed), className: "flex w-full items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: [_jsx("span", { className: `text-[8px] transition-transform ${collapsed ? '' : 'rotate-90'}`, children: "\u25B6" }), _jsx("span", { className: "font-pixel", children: group.label })] }), !collapsed && (_jsx("div", { className: "flex flex-col gap-0.5 px-1", children: tools.map((tool) => (_jsx(SidebarItem, { id: tool.id, name: tool.name, icon: tool.icon }, tool.id))) }))] }));
}
