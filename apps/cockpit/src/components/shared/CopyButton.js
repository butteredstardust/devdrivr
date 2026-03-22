import { jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { useUiStore } from '@/stores/ui.store';
export function CopyButton({ text, label = 'Copy', className = '' }) {
    const [copied, setCopied] = useState(false);
    const setLastAction = useUiStore((s) => s.setLastAction);
    async function handleCopy() {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setLastAction('Copied to clipboard', 'success');
        setTimeout(() => setCopied(false), 1500);
    }
    return (_jsx("button", { onClick: handleCopy, className: `rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] ${className}`, children: copied ? '✓ Copied' : label }));
}
