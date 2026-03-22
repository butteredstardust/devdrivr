import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
// HTMLHint has its own ruleset — import dynamically to avoid bundling issues
async function validateHtml(html) {
    const { HTMLHint } = await import('htmlhint');
    const results = HTMLHint.verify(html, {
        'tagname-lowercase': true,
        'attr-lowercase': true,
        'attr-value-double-quotes': true,
        'doctype-first': false,
        'tag-pair': true,
        'spec-char-escape': true,
        'id-unique': true,
        'src-not-empty': true,
        'attr-no-duplication': true,
        'title-require': true,
        'alt-require': true,
        'id-class-value': 'dash',
        'tag-self-close': false,
        'head-script-disabled': false,
        'attr-unsafe-chars': true,
    });
    return results.map((r) => ({
        message: r.message,
        line: r.line,
        col: r.col,
        // ReportType is a const enum — compare against the string values at runtime
        type: r.type === 'error' ? 'error' : 'warning',
        rule: r.rule.id,
    }));
}
export default function HtmlValidator() {
    useMonacoTheme();
    const [state, updateState] = useToolState('html-validator', {
        input: '',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [errors, setErrors] = useState([]);
    const debounceRef = useRef(null);
    useEffect(() => {
        if (!state.input.trim()) {
            setErrors([]);
            return;
        }
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const errs = await validateHtml(state.input);
            setErrors(errs);
            const errorCount = errs.filter((e) => e.type === 'error').length;
            const warnCount = errs.filter((e) => e.type === 'warning').length;
            if (errs.length === 0) {
                setLastAction('Valid HTML', 'success');
            }
            else {
                setLastAction(`${errorCount} error(s), ${warnCount} warning(s)`, errorCount > 0 ? 'error' : 'info');
            }
        }, 300);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [state.input, setLastAction]);
    const errorCount = errors.filter((e) => e.type === 'error').length;
    const warnCount = errors.filter((e) => e.type === 'warning').length;
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2", children: [state.input.trim() && errors.length === 0 && (_jsx("span", { className: "text-xs text-[var(--color-success)]", children: "\u2713 Valid HTML" })), errorCount > 0 && _jsxs("span", { className: "text-xs text-[var(--color-error)]", children: ["\u2717 ", errorCount, " error(s)"] }), warnCount > 0 && _jsxs("span", { className: "text-xs text-[var(--color-warning)]", children: ["\u26A0 ", warnCount, " warning(s)"] }), _jsx("div", { className: "ml-auto", children: _jsx(CopyButton, { text: state.input }) })] }), errors.length > 0 && (_jsx("div", { className: "max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2", children: errors.map((e, i) => (_jsxs("div", { className: `text-xs ${e.type === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`, children: [_jsxs("span", { className: "text-[var(--color-text-muted)]", children: ["Line ", e.line, ":", e.col] }), ' ', _jsxs("span", { className: "text-[var(--color-text-muted)]", children: ["[", e.rule, "]"] }), " ", e.message] }, i))) })), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: "html", value: state.input, onChange: (v) => updateState({ input: v ?? '' }), options: EDITOR_OPTIONS }) })] }));
}
