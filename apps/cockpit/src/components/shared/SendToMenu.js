import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TOOLS } from '@/app/tool-registry';
import { useUiStore } from '@/stores/ui.store';
export function SendToMenu({ content, position, onClose }) {
    const setActiveTool = useUiStore((s) => s.setActiveTool);
    const addToast = useUiStore((s) => s.addToast);
    const menuRef = useRef(null);
    const [filter, setFilter] = useState('');
    const tools = TOOLS.filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()));
    const setPendingSendTo = useUiStore((s) => s.setPendingSendTo);
    const handleSelect = useCallback((toolId, toolName) => {
        setPendingSendTo(content);
        setActiveTool(toolId);
        addToast(`Sent to ${toolName}`, 'success');
        onClose();
    }, [content, setActiveTool, setPendingSendTo, addToast, onClose]);
    useEffect(() => {
        function handleClickOutside(e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                onClose();
            }
        }
        function handleEscape(e) {
            if (e.key === 'Escape')
                onClose();
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);
    return (_jsxs("div", { ref: menuRef, className: "fixed z-50 w-56 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg", style: { left: position.x, top: position.y }, children: [_jsx("div", { className: "border-b border-[var(--color-border)] p-2", children: _jsx("input", { value: filter, onChange: (e) => setFilter(e.target.value), placeholder: "Send to...", className: "w-full bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none", autoFocus: true }) }), _jsx("div", { className: "max-h-64 overflow-auto py-1", children: tools.map((tool) => (_jsxs("button", { onClick: () => handleSelect(tool.id, tool.name), className: "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]", children: [_jsx("span", { className: "w-5 text-center font-pixel text-[10px] text-[var(--color-text-muted)]", children: tool.icon }), tool.name] }, tool.id))) })] }));
}
export const SendToContext = createContext({
    showSendTo: () => { },
});
export function useSendTo() {
    return useContext(SendToContext);
}
