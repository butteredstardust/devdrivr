import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as cssTree from 'css-tree';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
function validateCss(css) {
    const errors = [];
    try {
        cssTree.parse(css, {
            onParseError: (error) => {
                // css-tree's SyntaxParseError has line/column at runtime even though
                // @types/css-tree doesn't declare them on SyntaxParseError directly
                const err = error;
                errors.push({
                    message: error.message,
                    line: err.line ?? 0,
                    column: err.column ?? 0,
                });
            },
        });
    }
    catch (e) {
        errors.push({ message: e.message, line: 1, column: 1 });
    }
    return errors;
}
export default function CssValidator() {
    useMonacoTheme();
    const [state, updateState] = useToolState('css-validator', {
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
        debounceRef.current = setTimeout(() => {
            const errs = validateCss(state.input);
            setErrors(errs);
            if (errs.length === 0) {
                setLastAction('Valid CSS', 'success');
            }
            else {
                setLastAction(`${errs.length} error(s)`, 'error');
            }
        }, 300);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [state.input, setLastAction]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2", children: [state.input.trim() && errors.length === 0 && (_jsx("span", { className: "text-xs text-[var(--color-success)]", children: "\u2713 Valid CSS" })), errors.length > 0 && (_jsxs("span", { className: "text-xs text-[var(--color-error)]", children: ["\u2717 ", errors.length, " error(s)"] })), _jsx("div", { className: "ml-auto", children: _jsx(CopyButton, { text: state.input }) })] }), errors.length > 0 && (_jsx("div", { className: "max-h-32 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2", children: errors.map((e, i) => (_jsxs("div", { className: "text-xs text-[var(--color-error)]", children: [_jsxs("span", { className: "text-[var(--color-text-muted)]", children: ["Line ", e.line, ":", e.column] }), " ", e.message] }, i))) })), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: "css", value: state.input, onChange: (v) => updateState({ input: v ?? '' }), options: EDITOR_OPTIONS }) })] }));
}
