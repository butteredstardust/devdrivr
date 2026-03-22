import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { useWorker } from '@/hooks/useWorker';
import { TabBar } from '@/components/shared/TabBar';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
const TABS = [
    { id: 'lint', label: 'Lint & Format' },
    { id: 'tree', label: 'Tree View' },
    { id: 'table', label: 'Table View' },
];
export default function JsonTools() {
    useMonacoTheme();
    const [state, updateState] = useToolState('json-tools', {
        input: '',
        activeTab: 'lint',
    });
    const formatter = useWorker(() => new Worker(new URL('../../workers/formatter.worker.ts', import.meta.url), { type: 'module' }));
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [error, setError] = useState(null);
    // Parse input for tree/table views
    const parsed = useMemo(() => {
        if (!state.input.trim())
            return { ok: false, data: null, error: null };
        try {
            return { ok: true, data: JSON.parse(state.input), error: null };
        }
        catch (e) {
            return { ok: false, data: null, error: e.message };
        }
    }, [state.input]);
    const handleFormat = useCallback(async () => {
        if (!formatter)
            return;
        try {
            const result = await formatter.format(state.input, { language: 'json' });
            updateState({ input: result });
            setError(null);
            setLastAction('Formatted JSON', 'success');
        }
        catch (e) {
            const msg = e.message;
            setError(msg);
            setLastAction('Invalid JSON', 'error');
        }
    }, [formatter, state.input, updateState, setLastAction]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx(TabBar, { tabs: TABS, activeTab: state.activeTab, onTabChange: (id) => updateState({ activeTab: id }) }), _jsxs("div", { className: "flex-1 overflow-hidden", children: [state.activeTab === 'lint' && (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("button", { onClick: handleFormat, className: "rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "Format" }), _jsx(CopyButton, { text: state.input }), parsed.ok && (_jsx("span", { className: "text-xs text-[var(--color-success)]", children: "\u2713 Valid JSON" })), parsed.error && (_jsxs("span", { className: "text-xs text-[var(--color-error)]", children: ["\u2717 ", parsed.error] }))] }), error && (_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]", children: error })), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: "json", value: state.input, onChange: (v) => updateState({ input: v ?? '' }), options: EDITOR_OPTIONS }) })] })), state.activeTab === 'tree' && (_jsx("div", { className: "h-full overflow-auto p-4", children: parsed.ok ? (_jsx(JsonTree, { data: parsed.data, path: "$" })) : (_jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: parsed.error ? `Parse error: ${parsed.error}` : 'Enter JSON in the Lint & Format tab' })) })), state.activeTab === 'table' && (_jsx("div", { className: "h-full overflow-auto p-4", children: parsed.ok && Array.isArray(parsed.data) ? (_jsx(JsonTable, { data: parsed.data })) : (_jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: parsed.error
                                ? `Parse error: ${parsed.error}`
                                : parsed.ok
                                    ? 'Table view requires a JSON array of objects'
                                    : 'Enter JSON in the Lint & Format tab' })) }))] })] }));
}
// --- Tree View Component ---
function JsonTree({ data, path }) {
    const [expanded, setExpanded] = useState(true);
    const setLastAction = useUiStore((s) => s.setLastAction);
    const copyPath = useCallback(() => {
        navigator.clipboard.writeText(path);
        setLastAction(`Copied: ${path}`, 'success');
    }, [path, setLastAction]);
    if (data === null)
        return _jsx("span", { className: "text-[var(--color-text-muted)]", children: "null" });
    if (typeof data === 'boolean')
        return _jsx("span", { className: "text-[var(--color-warning)]", children: String(data) });
    if (typeof data === 'number')
        return _jsx("span", { className: "text-[var(--color-accent)]", children: data });
    if (typeof data === 'string')
        return _jsxs("span", { className: "text-[var(--color-success)]", children: ["\"", data, "\""] });
    if (Array.isArray(data)) {
        return (_jsxs("div", { className: "ml-4", children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: [expanded ? '▼' : '▶', " ", _jsxs("span", { className: "cursor-pointer text-xs hover:underline", onClick: copyPath, children: ["[", data.length, "]"] })] }), expanded && data.map((item, i) => (_jsxs("div", { className: "ml-4", children: [_jsxs("span", { className: "text-[var(--color-text-muted)]", children: [i, ": "] }), _jsx(JsonTree, { data: item, path: `${path}[${i}]` })] }, i)))] }));
    }
    if (typeof data === 'object') {
        const entries = Object.entries(data);
        return (_jsxs("div", { className: "ml-4", children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: [expanded ? '▼' : '▶', " ", _jsx("span", { className: "cursor-pointer text-xs hover:underline", onClick: copyPath, children: `{${entries.length}}` })] }), expanded && entries.map(([key, value]) => (_jsxs("div", { className: "ml-4", children: [_jsxs("span", { className: "text-[var(--color-accent)]", children: ["\"", key, "\""] }), _jsx("span", { className: "text-[var(--color-text-muted)]", children: ": " }), _jsx(JsonTree, { data: value, path: `${path}.${key}` })] }, key)))] }));
    }
    return _jsx("span", { children: String(data) });
}
// --- Table View Component ---
function JsonTable({ data }) {
    const setLastAction = useUiStore((s) => s.setLastAction);
    const columns = useMemo(() => {
        const keys = new Set();
        for (const row of data) {
            for (const key of Object.keys(row))
                keys.add(key);
        }
        return Array.from(keys);
    }, [data]);
    const copyCell = useCallback((value) => {
        navigator.clipboard.writeText(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
        setLastAction('Copied cell', 'success');
    }, [setLastAction]);
    if (data.length === 0)
        return _jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: "Empty array" });
    return (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "w-full border-collapse text-xs", children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((col) => (_jsx("th", { className: "border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left font-mono font-bold text-[var(--color-accent)]", children: col }, col))) }) }), _jsx("tbody", { children: data.map((row, i) => (_jsx("tr", { className: "hover:bg-[var(--color-surface-hover)]", children: columns.map((col) => {
                            const value = row[col];
                            return (_jsx("td", { onClick: () => copyCell(value), className: "cursor-pointer border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-surface)]", title: "Click to copy", children: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }, col));
                        }) }, i))) })] }) }));
}
