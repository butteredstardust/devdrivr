import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import { CopyButton } from '@/components/shared/CopyButton';
import { useToolState } from '@/hooks/useToolState';
import { useUiStore } from '@/stores/ui.store';
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function generateUuid() {
    return crypto.randomUUID();
}
export default function UuidGenerator() {
    const [state, updateState] = useToolState('uuid-generator', {
        lastGenerated: '',
        bulkCount: 10,
        validateInput: '',
    });
    const [bulkUuids, setBulkUuids] = useState([]);
    const setLastAction = useUiStore((s) => s.setLastAction);
    const generate = useCallback(() => {
        const uuid = generateUuid();
        updateState({ lastGenerated: uuid });
        setLastAction('Generated UUID', 'success');
    }, [updateState, setLastAction]);
    const generateBulk = useCallback(() => {
        const count = Math.min(Math.max(1, state.bulkCount), 100);
        const uuids = Array.from({ length: count }, () => generateUuid());
        setBulkUuids(uuids);
        setLastAction(`Generated ${count} UUIDs`, 'success');
    }, [state.bulkCount, setLastAction]);
    const validateResult = state.validateInput.trim()
        ? UUID_V4_REGEX.test(state.validateInput.trim())
            ? { valid: true, message: '✓ Valid UUID v4' }
            : { valid: false, message: '✗ Not a valid UUID v4' }
        : null;
    return (_jsxs("div", { className: "flex h-full flex-col gap-6 p-6", children: [_jsxs("section", { className: "flex flex-col gap-3", children: [_jsx("h2", { className: "font-pixel text-sm text-[var(--color-text)]", children: "Generate" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: generate, className: "rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "Generate UUID" }), state.lastGenerated && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("code", { className: "rounded bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]", children: state.lastGenerated }), _jsx(CopyButton, { text: state.lastGenerated })] }))] })] }), _jsxs("section", { className: "flex flex-col gap-3", children: [_jsx("h2", { className: "font-pixel text-sm text-[var(--color-text)]", children: "Bulk Generate" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { type: "number", min: 1, max: 100, value: state.bulkCount, onChange: (e) => updateState({ bulkCount: parseInt(e.target.value) || 1 }), className: "w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]" }), _jsx("button", { onClick: generateBulk, className: "rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "Generate" }), bulkUuids.length > 0 && (_jsx(CopyButton, { text: bulkUuids.join('\n'), label: "Copy All" }))] }), bulkUuids.length > 0 && (_jsx("pre", { className: "max-h-60 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]", children: bulkUuids.join('\n') }))] }), _jsxs("section", { className: "flex flex-col gap-3", children: [_jsx("h2", { className: "font-pixel text-sm text-[var(--color-text)]", children: "Validate" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { type: "text", value: state.validateInput, onChange: (e) => updateState({ validateInput: e.target.value }), placeholder: "Paste a UUID to validate...", className: "w-96 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]" }), validateResult && (_jsx("span", { className: `text-sm ${validateResult.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`, children: validateResult.message }))] })] })] }));
}
