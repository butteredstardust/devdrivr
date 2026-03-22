import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useToolState } from '@/hooks/useToolState';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
import { md5 } from 'js-md5';
async function computeHashes(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const [sha1, sha256, sha512] = await Promise.all([
        crypto.subtle.digest('SHA-1', data),
        crypto.subtle.digest('SHA-256', data),
        crypto.subtle.digest('SHA-512', data),
    ]);
    const toHex = (buffer) => Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return {
        md5: md5(input),
        sha1: toHex(sha1),
        sha256: toHex(sha256),
        sha512: toHex(sha512),
    };
}
export default function HashGenerator() {
    const [state, updateState] = useToolState('hash-generator', {
        input: '',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [hashes, setHashes] = useState(null);
    const debounceRef = useRef(null);
    // setLastAction used for copy feedback (bubbles through CopyButton)
    void setLastAction;
    useEffect(() => {
        if (!state.input) {
            setHashes(null);
            return;
        }
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            computeHashes(state.input).then(setHashes);
        }, 200);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [state.input]);
    const hashList = hashes
        ? [
            { label: 'MD5', value: hashes.md5 },
            { label: 'SHA-1', value: hashes.sha1 },
            { label: 'SHA-256', value: hashes.sha256 },
            { label: 'SHA-512', value: hashes.sha512 },
        ]
        : [];
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "border-b border-[var(--color-border)] p-4", children: [_jsx("h2", { className: "mb-2 font-pixel text-sm text-[var(--color-text)]", children: "Input" }), _jsx("textarea", { value: state.input, onChange: (e) => updateState({ input: e.target.value }), placeholder: "Enter text to hash...", rows: 4, className: "w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]" })] }), _jsx("div", { className: "flex-1 overflow-auto p-4", children: hashList.length > 0 ? (_jsx("div", { className: "flex flex-col gap-3", children: hashList.map((h) => (_jsxs("div", { className: "flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-xs text-[var(--color-text-muted)]", children: h.label }), _jsx("div", { className: "truncate font-mono text-xs text-[var(--color-text)]", children: h.value })] }), _jsx(CopyButton, { text: h.value, className: "ml-2 shrink-0" })] }, h.label))) })) : (_jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: "Enter text above to see hashes" })) })] }));
}
