import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import { useToolState } from '@/hooks/useToolState';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
function parseUrl(input) {
    try {
        const url = new URL(input);
        const params = [];
        url.searchParams.forEach((value, key) => {
            params.push({ key, value });
        });
        return {
            protocol: url.protocol,
            host: url.host,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            params,
        };
    }
    catch {
        return null;
    }
}
export default function UrlCodec() {
    const [state, updateState] = useToolState('url-codec', {
        input: '',
        mode: 'encode',
        encodeMode: 'component',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const output = useMemo(() => {
        if (!state.input.trim())
            return { text: '', error: null };
        try {
            if (state.mode === 'encode') {
                return {
                    text: state.encodeMode === 'component'
                        ? encodeURIComponent(state.input)
                        : encodeURI(state.input),
                    error: null,
                };
            }
            else {
                return {
                    text: state.encodeMode === 'component'
                        ? decodeURIComponent(state.input)
                        : decodeURI(state.input),
                    error: null,
                };
            }
        }
        catch (e) {
            return { text: '', error: e.message };
        }
    }, [state.input, state.mode, state.encodeMode]);
    const urlParts = useMemo(() => {
        const decoded = state.mode === 'decode' && output.text ? output.text : state.input;
        return parseUrl(decoded);
    }, [state.input, state.mode, output.text]);
    const handleToggle = useCallback(() => {
        updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' });
        setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info');
    }, [state.mode, updateState, setLastAction]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("button", { onClick: handleToggle, className: "rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: state.mode === 'encode' ? 'Encode →' : '← Decode' }), _jsxs("select", { value: state.encodeMode, onChange: (e) => updateState({ encodeMode: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: "component", children: "Component (encodeURIComponent)" }), _jsx("option", { value: "full", children: "Full URL (encodeURI)" })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex w-1/2 flex-col border-r border-[var(--color-border)]", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Input" }), _jsx("textarea", { value: state.input, onChange: (e) => updateState({ input: e.target.value }), placeholder: "Enter text or URL...", className: "flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" })] }), _jsxs("div", { className: "flex w-1/2 flex-col", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1", children: [_jsx("span", { className: "text-xs text-[var(--color-text-muted)]", children: "Output" }), _jsx(CopyButton, { text: output.text })] }), output.error ? (_jsx("div", { className: "p-4 text-sm text-[var(--color-error)]", children: output.error })) : (_jsx("pre", { className: "flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]", children: output.text }))] })] }), urlParts && (_jsxs("div", { className: "shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4", children: [_jsx("h3", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "URL Parts" }), _jsxs("div", { className: "grid grid-cols-2 gap-x-6 gap-y-1 text-xs", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: "Protocol:" }), " ", _jsx("span", { className: "text-[var(--color-text)]", children: urlParts.protocol })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: "Host:" }), " ", _jsx("span", { className: "text-[var(--color-text)]", children: urlParts.host })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: "Path:" }), " ", _jsx("span", { className: "text-[var(--color-text)]", children: urlParts.pathname })] }), _jsxs("div", { children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: "Hash:" }), " ", _jsx("span", { className: "text-[var(--color-text)]", children: urlParts.hash || '(none)' })] })] }), urlParts.params.length > 0 && (_jsxs("div", { className: "mt-2", children: [_jsx("div", { className: "mb-1 text-xs text-[var(--color-text-muted)]", children: "Query Parameters:" }), urlParts.params.map((p, i) => (_jsxs("div", { className: "flex gap-2 text-xs", children: [_jsx("span", { className: "text-[var(--color-accent)]", children: p.key }), _jsx("span", { className: "text-[var(--color-text-muted)]", children: "=" }), _jsx("span", { className: "text-[var(--color-text)]", children: p.value })] }, i)))] }))] }))] }));
}
