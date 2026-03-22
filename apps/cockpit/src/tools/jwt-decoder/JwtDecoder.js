import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useToolState } from '@/hooks/useToolState';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
function decodeBase64Url(str) {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    const withPadding = pad ? padded + '='.repeat(4 - pad) : padded;
    return decodeURIComponent(atob(withPadding)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''));
}
function decodeJwt(token) {
    const parts = token.trim().split('.');
    if (parts.length !== 3)
        return null;
    try {
        const headerRaw = decodeBase64Url(parts[0]);
        const payloadRaw = decodeBase64Url(parts[1]);
        const header = JSON.parse(headerRaw);
        const payload = JSON.parse(payloadRaw);
        let expiry = null;
        if (typeof payload['exp'] === 'number') {
            const expiresAt = new Date(payload['exp'] * 1000);
            const now = new Date();
            const diffMs = expiresAt.getTime() - now.getTime();
            const absDiff = Math.abs(diffMs);
            let relative;
            if (absDiff < 3600000)
                relative = `${Math.round(absDiff / 60000)} minutes`;
            else if (absDiff < 86400000)
                relative = `${Math.round(absDiff / 3600000)} hours`;
            else
                relative = `${Math.round(absDiff / 86400000)} days`;
            relative = diffMs >= 0 ? `in ${relative}` : `${relative} ago`;
            expiry = {
                expired: diffMs < 0,
                expiresAt: expiresAt.toLocaleString(),
                relative,
            };
        }
        return {
            header,
            payload,
            signature: parts[2],
            headerRaw,
            payloadRaw,
            expiry,
        };
    }
    catch {
        return null;
    }
}
export default function JwtDecoder() {
    const [state, updateState] = useToolState('jwt-decoder', {
        input: '',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    // setLastAction used for copy feedback (bubbles through CopyButton)
    void setLastAction;
    const decoded = useMemo(() => {
        if (!state.input.trim())
            return null;
        return decodeJwt(state.input);
    }, [state.input]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "border-b border-[var(--color-border)] p-4", children: [_jsx("h2", { className: "mb-2 font-pixel text-sm text-[var(--color-text)]", children: "JWT Token" }), _jsx("textarea", { value: state.input, onChange: (e) => updateState({ input: e.target.value }), placeholder: "Paste a JWT token (eyJ...)", rows: 3, className: "w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]" })] }), _jsx("div", { className: "flex-1 overflow-auto p-4", children: decoded ? (_jsxs("div", { className: "flex flex-col gap-4", children: [decoded.expiry && (_jsxs("div", { className: `rounded border px-3 py-2 text-sm ${decoded.expiry.expired
                                ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
                                : 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'}`, children: [decoded.expiry.expired ? '⚠ Token expired' : '✓ Token valid', " \u2014 expires ", decoded.expiry.expiresAt, " (", decoded.expiry.relative, ")"] })), _jsxs("section", { children: [_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsx("h3", { className: "font-pixel text-xs text-blue-400", children: "Header" }), _jsx(CopyButton, { text: JSON.stringify(decoded.header, null, 2) })] }), _jsx("pre", { className: "rounded border border-blue-400/30 bg-blue-400/5 p-3 font-mono text-xs text-[var(--color-text)]", children: JSON.stringify(decoded.header, null, 2) })] }), _jsxs("section", { children: [_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsx("h3", { className: "font-pixel text-xs text-green-400", children: "Payload" }), _jsx(CopyButton, { text: JSON.stringify(decoded.payload, null, 2) })] }), _jsx("pre", { className: "rounded border border-green-400/30 bg-green-400/5 p-3 font-mono text-xs text-[var(--color-text)]", children: JSON.stringify(decoded.payload, null, 2) })] }), _jsxs("section", { children: [_jsxs("div", { className: "mb-1 flex items-center justify-between", children: [_jsx("h3", { className: "font-pixel text-xs text-red-400", children: "Signature" }), _jsx(CopyButton, { text: decoded.signature })] }), _jsx("pre", { className: "rounded border border-red-400/30 bg-red-400/5 p-3 font-mono text-xs text-[var(--color-text)] break-all", children: decoded.signature })] })] })) : state.input.trim() ? (_jsx("div", { className: "text-sm text-[var(--color-error)]", children: "Invalid JWT token \u2014 expected format: header.payload.signature" })) : (_jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: "Paste a JWT token above to decode it" })) })] }));
}
