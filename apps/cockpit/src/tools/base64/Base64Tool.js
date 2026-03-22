import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo } from 'react';
import { useToolState } from '@/hooks/useToolState';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
function isValidBase64(str) {
    if (!str.trim())
        return false;
    try {
        return btoa(atob(str)) === str.replace(/\s/g, '');
    }
    catch {
        return false;
    }
}
export default function Base64Tool() {
    const [state, updateState] = useToolState('base64', {
        input: '',
        mode: 'encode',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const output = useMemo(() => {
        if (!state.input.trim())
            return { text: '', error: null };
        try {
            if (state.mode === 'encode') {
                return { text: btoa(unescape(encodeURIComponent(state.input))), error: null };
            }
            else {
                return { text: decodeURIComponent(escape(atob(state.input.replace(/\s/g, '')))), error: null };
            }
        }
        catch (e) {
            return { text: '', error: e.message };
        }
    }, [state.input, state.mode]);
    const autoDetect = useMemo(() => {
        if (!state.input.trim())
            return null;
        return isValidBase64(state.input.replace(/\s/g, ''));
    }, [state.input]);
    const handleSwap = useCallback(() => {
        if (output.text) {
            updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' });
            setLastAction('Swapped', 'info');
        }
    }, [output.text, state.mode, updateState, setLastAction]);
    const handleToggle = useCallback(() => {
        updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' });
        setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info');
    }, [state.mode, updateState, setLastAction]);
    useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("button", { onClick: handleToggle, className: "rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: state.mode === 'encode' ? 'Encode →' : '← Decode' }), _jsx("button", { onClick: handleSwap, disabled: !output.text, className: "rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50", children: "Swap \u21C4" }), autoDetect !== null && (_jsx("span", { className: `text-xs ${autoDetect ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`, children: autoDetect ? '✓ Input looks like Base64' : '' }))] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex w-1/2 flex-col border-r border-[var(--color-border)]", children: [_jsxs("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: ["Input (", state.mode === 'encode' ? 'Text' : 'Base64', ")"] }), _jsx("textarea", { value: state.input, onChange: (e) => updateState({ input: e.target.value }), placeholder: state.mode === 'encode' ? 'Enter text to encode...' : 'Enter Base64 to decode...', className: "flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" })] }), _jsxs("div", { className: "flex w-1/2 flex-col", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1", children: [_jsxs("span", { className: "text-xs text-[var(--color-text-muted)]", children: ["Output (", state.mode === 'encode' ? 'Base64' : 'Text', ")"] }), _jsx(CopyButton, { text: output.text })] }), output.error ? (_jsx("div", { className: "p-4 text-sm text-[var(--color-error)]", children: output.error })) : (_jsx("pre", { className: "flex-1 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)]", children: output.text }))] })] })] }));
}
