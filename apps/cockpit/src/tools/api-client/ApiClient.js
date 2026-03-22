import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { TabBar } from '@/components/shared/TabBar';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const RESPONSE_TABS = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers' },
];
export default function ApiClient() {
    useMonacoTheme();
    const [state, updateState] = useToolState('api-client', {
        method: 'GET',
        url: '',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        body: '',
        bodyMode: 'json',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [response, setResponse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [responseTab, setResponseTab] = useState('body');
    const handleSend = useCallback(async () => {
        if (!state.url.trim()) {
            setLastAction('Enter a URL', 'error');
            return;
        }
        setLoading(true);
        setError(null);
        const start = performance.now();
        try {
            const headers = {};
            for (const h of state.headers) {
                if (h.enabled && h.key.trim()) {
                    headers[h.key] = h.value;
                }
            }
            const opts = {
                method: state.method,
                headers,
            };
            if (state.method !== 'GET' && state.method !== 'HEAD' && state.body.trim()) {
                opts.body = state.body;
            }
            const res = await tauriFetch(state.url, opts);
            const time = Math.round(performance.now() - start);
            const body = await res.text();
            const resHeaders = {};
            res.headers.forEach((value, key) => {
                resHeaders[key] = value;
            });
            setResponse({ status: res.status, statusText: res.statusText, headers: resHeaders, body, time });
            setLastAction(`${res.status} ${res.statusText} (${time}ms)`, res.ok ? 'success' : 'error');
        }
        catch (e) {
            const msg = e.message;
            setError(msg);
            setLastAction('Request failed', 'error');
        }
        finally {
            setLoading(false);
        }
    }, [state, setLastAction]);
    useKeyboardShortcut({ key: 'Enter', mod: true }, handleSend);
    const addHeader = useCallback(() => {
        updateState({ headers: [...state.headers, { key: '', value: '', enabled: true }] });
    }, [state.headers, updateState]);
    const updateHeader = useCallback((index, patch) => {
        const headers = state.headers.map((h, i) => (i === index ? { ...h, ...patch } : h));
        updateState({ headers });
    }, [state.headers, updateState]);
    const removeHeader = useCallback((index) => {
        updateState({ headers: state.headers.filter((_, i) => i !== index) });
    }, [state.headers, updateState]);
    // Try to prettify JSON response
    const prettyBody = (() => {
        if (!response?.body)
            return '';
        try {
            return JSON.stringify(JSON.parse(response.body), null, 2);
        }
        catch {
            return response.body;
        }
    })();
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("select", { value: state.method, onChange: (e) => updateState({ method: e.target.value }), className: "rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 font-pixel text-xs text-[var(--color-accent)] outline-none", children: METHODS.map((m) => _jsx("option", { value: m, children: m }, m)) }), _jsx("input", { value: state.url, onChange: (e) => updateState({ url: e.target.value }), placeholder: "https://api.example.com/endpoint", className: "flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]", onKeyDown: (e) => { if (e.key === 'Enter')
                            handleSend(); } }), _jsx("button", { onClick: handleSend, disabled: loading, className: "rounded border border-[var(--color-accent)] px-4 py-1.5 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50", children: loading ? '...' : 'Send' })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex w-1/2 flex-col border-r border-[var(--color-border)]", children: [_jsxs("div", { className: "border-b border-[var(--color-border)] px-3 py-2", children: [_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsx("span", { className: "font-pixel text-xs text-[var(--color-text-muted)]", children: "Headers" }), _jsx("button", { onClick: addHeader, className: "text-xs text-[var(--color-accent)] hover:underline", children: "+ Add" })] }), _jsx("div", { className: "max-h-32 overflow-auto", children: state.headers.map((h, i) => (_jsxs("div", { className: "mb-1 flex items-center gap-1", children: [_jsx("input", { type: "checkbox", checked: h.enabled, onChange: (e) => updateHeader(i, { enabled: e.target.checked }), className: "accent-[var(--color-accent)]" }), _jsx("input", { value: h.key, onChange: (e) => updateHeader(i, { key: e.target.value }), placeholder: "Key", className: "w-28 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none" }), _jsx("input", { value: h.value, onChange: (e) => updateHeader(i, { value: e.target.value }), placeholder: "Value", className: "flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs text-[var(--color-text)] outline-none" }), _jsx("button", { onClick: () => removeHeader(i), className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]", children: "\u00D7" })] }, i))) })] }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Body" }), _jsx(Editor, { language: "json", value: state.body, onChange: (v) => updateState({ body: v ?? '' }), options: EDITOR_OPTIONS })] })] }), _jsxs("div", { className: "flex w-1/2 flex-col", children: [error && (_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]", children: error })), response && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-1", children: [_jsxs("span", { className: `font-mono text-sm font-bold ${response.status < 400 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`, children: [response.status, " ", response.statusText] }), _jsxs("span", { className: "text-xs text-[var(--color-text-muted)]", children: [response.time, "ms"] }), _jsx("div", { className: "ml-auto", children: _jsx(CopyButton, { text: prettyBody }) })] }), _jsx(TabBar, { tabs: RESPONSE_TABS, activeTab: responseTab, onTabChange: setResponseTab }), _jsx("div", { className: "flex-1 overflow-auto", children: responseTab === 'body' ? (_jsx(Editor, { language: "json", value: prettyBody, options: { ...EDITOR_OPTIONS, readOnly: true } })) : (_jsx("div", { className: "p-3", children: Object.entries(response.headers).map(([key, value]) => (_jsxs("div", { className: "mb-1 text-xs", children: [_jsx("span", { className: "text-[var(--color-accent)]", children: key }), _jsx("span", { className: "text-[var(--color-text-muted)]", children: ": " }), _jsx("span", { className: "text-[var(--color-text)]", children: value })] }, key))) })) })] })), !response && !error && (_jsx("div", { className: "flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]", children: "Send a request to see the response" }))] })] })] }));
}
