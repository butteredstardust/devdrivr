import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState, useCallback } from 'react';
import { useToolState } from '@/hooks/useToolState';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
const REFERENCE = [
    { pattern: '.', desc: 'Any character except newline' },
    { pattern: '\\d', desc: 'Digit [0-9]' },
    { pattern: '\\w', desc: 'Word char [a-zA-Z0-9_]' },
    { pattern: '\\s', desc: 'Whitespace' },
    { pattern: '\\b', desc: 'Word boundary' },
    { pattern: '^', desc: 'Start of string/line' },
    { pattern: '$', desc: 'End of string/line' },
    { pattern: '*', desc: '0 or more' },
    { pattern: '+', desc: '1 or more' },
    { pattern: '?', desc: '0 or 1' },
    { pattern: '{n,m}', desc: 'Between n and m' },
    { pattern: '()', desc: 'Capture group' },
    { pattern: '(?:)', desc: 'Non-capture group' },
    { pattern: '(?<name>)', desc: 'Named group' },
    { pattern: '|', desc: 'Alternation (or)' },
    { pattern: '[abc]', desc: 'Character class' },
    { pattern: '[^abc]', desc: 'Negated class' },
    { pattern: '(?=)', desc: 'Positive lookahead' },
    { pattern: '(?!)', desc: 'Negative lookahead' },
];
function findMatches(pattern, flags, text) {
    if (!pattern)
        return { matches: [], error: null };
    try {
        const re = new RegExp(pattern, flags);
        const matches = [];
        if (flags.includes('g')) {
            let m;
            let guard = 0;
            while ((m = re.exec(text)) !== null && guard < 1000) {
                guard++;
                const groups = [];
                for (let i = 1; i < m.length; i++) {
                    const name = m.groups ? Object.entries(m.groups).find(([, v]) => v === m[i])?.[0] ?? null : null;
                    groups.push({ name, value: m[i] ?? '' });
                }
                matches.push({ full: m[0], index: m.index, groups });
                if (m[0] === '')
                    re.lastIndex++; // prevent infinite loop on zero-width match
            }
        }
        else {
            const m = re.exec(text);
            if (m) {
                const groups = [];
                for (let i = 1; i < m.length; i++) {
                    const name = m.groups ? Object.entries(m.groups).find(([, v]) => v === m[i])?.[0] ?? null : null;
                    groups.push({ name, value: m[i] ?? '' });
                }
                matches.push({ full: m[0], index: m.index, groups });
            }
        }
        return { matches, error: null };
    }
    catch (e) {
        return { matches: [], error: e.message };
    }
}
function highlightMatches(text, pattern, flags) {
    if (!pattern || !text)
        return '';
    try {
        const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        return text.replace(re, (match) => `<mark class="bg-[var(--color-accent)]/30 text-[var(--color-accent)] rounded px-0.5">${match}</mark>`);
    }
    catch {
        return text;
    }
}
export default function RegexTester() {
    const [state, updateState] = useToolState('regex-tester', {
        pattern: '',
        flags: 'g',
        testString: '',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [showRef, setShowRef] = useState(false);
    const result = useMemo(() => findMatches(state.pattern, state.flags, state.testString), [state.pattern, state.flags, state.testString]);
    const highlighted = useMemo(() => highlightMatches(state.testString, state.pattern, state.flags), [state.testString, state.pattern, state.flags]);
    const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u'];
    const toggleFlag = useCallback((flag) => {
        const newFlags = state.flags.includes(flag)
            ? state.flags.replace(flag, '')
            : state.flags + flag;
        updateState({ flags: newFlags });
    }, [state.flags, updateState]);
    // Report match count to status bar
    useMemo(() => {
        if (result.error) {
            setLastAction(result.error, 'error');
        }
        else if (result.matches.length > 0) {
            setLastAction(`${result.matches.length} match(es) found`, 'success');
        }
    }, [result, setLastAction]);
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("span", { className: "font-pixel text-xs text-[var(--color-text-muted)]", children: "/" }), _jsx("input", { value: state.pattern, onChange: (e) => updateState({ pattern: e.target.value }), placeholder: "Enter regex pattern...", className: "flex-1 border-none bg-transparent font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" }), _jsx("span", { className: "font-pixel text-xs text-[var(--color-text-muted)]", children: "/" }), _jsx("div", { className: "flex gap-1", children: FLAG_OPTIONS.map((flag) => (_jsx("button", { onClick: () => toggleFlag(flag), className: `h-6 w-6 rounded text-xs font-bold ${state.flags.includes(flag)
                                        ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'}`, children: flag }, flag))) }), _jsxs("button", { onClick: () => setShowRef(!showRef), className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: [showRef ? 'Hide' : 'Show', " Reference"] }), result.error && (_jsx("span", { className: "text-xs text-[var(--color-error)]", children: result.error })), !result.error && result.matches.length > 0 && (_jsxs("span", { className: "text-xs text-[var(--color-success)]", children: [result.matches.length, " match(es)"] }))] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex w-1/2 flex-col border-r border-[var(--color-border)]", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Test String" }), _jsx("textarea", { value: state.testString, onChange: (e) => updateState({ testString: e.target.value }), placeholder: "Enter text to test against...", className: "flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" })] }), _jsxs("div", { className: "flex w-1/2 flex-col", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Highlighted Matches" }), _jsx("div", { className: "flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-[var(--color-text)]", dangerouslySetInnerHTML: { __html: highlighted || '<span class="text-[var(--color-text-muted)]">Matches will be highlighted here</span>' } })] })] }), result.matches.length > 0 && (_jsxs("div", { className: "max-h-48 shrink-0 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3", children: [_jsx("div", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "Match Details" }), result.matches.map((m, i) => (_jsxs("div", { className: "mb-2 flex items-start gap-3 text-xs", children: [_jsxs("span", { className: "shrink-0 text-[var(--color-text-muted)]", children: ["#", i + 1, " @", m.index] }), _jsx("code", { className: "text-[var(--color-accent)]", children: m.full }), m.groups.length > 0 && (_jsxs("span", { className: "text-[var(--color-text-muted)]", children: ["groups: ", m.groups.map((g, j) => (_jsxs("span", { children: [g.name ? `${g.name}=` : '', _jsx("code", { className: "text-[var(--color-text)]", children: g.value }), j < m.groups.length - 1 ? ', ' : ''] }, j)))] })), _jsx(CopyButton, { text: m.full, label: "Copy match", className: "ml-auto shrink-0" })] }, i)))] }))] }), showRef && (_jsxs("div", { className: "w-52 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3", children: [_jsx("h3", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "Reference" }), REFERENCE.map((r) => (_jsxs("div", { className: "mb-1 text-xs", children: [_jsx("code", { className: "text-[var(--color-accent)]", children: r.pattern }), _jsx("span", { className: "ml-1 text-[var(--color-text-muted)]", children: r.desc })] }, r.pattern)))] }))] }));
}
