import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Fuse from 'fuse.js';
import { TOOLS } from '@/app/tool-registry';
import { useUiStore } from '@/stores/ui.store';
import { usePlatform } from '@/hooks/usePlatform';
export function CommandPalette() {
    const isOpen = useUiStore((s) => s.commandPaletteOpen);
    const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
    const setActiveTool = useUiStore((s) => s.setActiveTool);
    const { modSymbol } = usePlatform();
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const fuse = useMemo(() => new Fuse(TOOLS, {
        keys: ['name', 'description'],
        threshold: 0.4,
        includeScore: true,
    }), []);
    const results = useMemo(() => {
        if (!query.trim())
            return TOOLS;
        return fuse.search(query).map((r) => r.item);
    }, [query, fuse]);
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [isOpen]);
    const onKeyDown = useCallback((e) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
                break;
            case 'Enter': {
                e.preventDefault();
                const selected = results[selectedIndex];
                if (selected) {
                    setActiveTool(selected.id);
                    setOpen(false);
                }
                break;
            }
            case 'Escape':
                e.preventDefault();
                setOpen(false);
                break;
        }
    }, [results, selectedIndex, setActiveTool, setOpen]);
    if (!isOpen)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "fixed inset-0 z-40 bg-black/50", onClick: () => setOpen(false) }), _jsxs("div", { className: "fixed left-1/2 top-[15%] z-50 w-[500px] -translate-x-1/2 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl", children: [_jsxs("div", { className: "flex items-center border-b border-[var(--color-border)] px-3", children: [_jsx("span", { className: "mr-2 text-sm text-[var(--color-text-muted)]", children: ">" }), _jsx("input", { ref: inputRef, value: query, onChange: (e) => {
                                    setQuery(e.target.value);
                                    setSelectedIndex(0);
                                }, onKeyDown: onKeyDown, placeholder: `Search tools... (${modSymbol}+K)`, className: "h-11 flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" })] }), _jsxs("div", { className: "max-h-80 overflow-y-auto py-1", children: [results.map((tool, i) => (_jsxs("button", { className: `flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === selectedIndex
                                    ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`, onClick: () => {
                                    setActiveTool(tool.id);
                                    setOpen(false);
                                }, onMouseEnter: () => setSelectedIndex(i), children: [_jsx("span", { className: "w-6 shrink-0 text-center font-pixel text-[10px]", children: tool.icon }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-medium", children: tool.name }), _jsx("div", { className: "text-xs text-[var(--color-text-muted)]", children: tool.description })] })] }, tool.id))), results.length === 0 && (_jsx("div", { className: "px-3 py-4 text-center text-sm text-[var(--color-text-muted)]", children: "No tools found" }))] })] })] }));
}
