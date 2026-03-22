import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, useCallback } from 'react';
import { useUiStore } from '@/stores/ui.store';
import { getToolById } from '@/app/tool-registry';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useFileDropZone } from '@/hooks/useFileDropZone';
import { dispatchToolAction } from '@/lib/tool-actions';
export function Workspace() {
    const activeTool = useUiStore((s) => s.activeTool);
    const tool = getToolById(activeTool);
    const addToast = useUiStore((s) => s.addToast);
    const handleFileDrop = useCallback((content, filename) => {
        dispatchToolAction({ type: 'open-file', content, filename });
        addToast(`Loaded ${filename}`, 'success');
    }, [addToast]);
    const { isDragging } = useFileDropZone(handleFileDrop);
    if (!tool) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-[var(--color-text-muted)]", children: "No tool selected" }));
    }
    const ToolComponent = tool.component;
    return (_jsxs("div", { className: "relative flex h-full flex-col overflow-hidden", children: [isDragging && (_jsx("div", { className: "absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm", children: _jsx("div", { className: "rounded border-2 border-dashed border-[var(--color-accent)] px-8 py-4 font-pixel text-sm text-[var(--color-accent)]", children: "Drop file here" }) })), _jsx("div", { className: "flex h-10 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4", children: _jsx("span", { className: "font-pixel text-xs text-[var(--color-accent)]", children: tool.name }) }), _jsx("div", { className: "flex-1 overflow-auto", children: _jsx(ErrorBoundary, { children: _jsx(Suspense, { fallback: _jsx("div", { className: "flex h-full items-center justify-center text-[var(--color-text-muted)]", children: "Loading..." }), children: _jsx(ToolComponent, {}) }) }, activeTool) })] }));
}
