import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { useUiStore } from '@/stores/ui.store';
const TEMPLATES = {
    basic: JSON.stringify({
        type: 'object',
        properties: {
            name: { type: 'string' },
            age: { type: 'integer', minimum: 0 },
            email: { type: 'string', format: 'email' },
        },
        required: ['name', 'email'],
    }, null, 2),
};
export default function JsonSchemaValidator() {
    useMonacoTheme();
    const [state, updateState] = useToolState('json-schema-validator', {
        data: '',
        schema: TEMPLATES['basic'] ?? '',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [errors, setErrors] = useState([]);
    const [valid, setValid] = useState(null);
    const debounceRef = useRef(null);
    useEffect(() => {
        if (!state.data.trim() || !state.schema.trim()) {
            setErrors([]);
            setValid(null);
            return;
        }
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            try {
                const data = JSON.parse(state.data);
                const schema = JSON.parse(state.schema);
                const ajv = new Ajv({ allErrors: true, verbose: true });
                addFormats(ajv);
                const validate = ajv.compile(schema);
                const isValid = validate(data);
                if (isValid) {
                    setValid(true);
                    setErrors([]);
                    setLastAction('Valid', 'success');
                }
                else {
                    setValid(false);
                    const errs = (validate.errors ?? []).map((e) => ({
                        path: e.instancePath || '/',
                        message: e.message ?? 'Unknown error',
                    }));
                    setErrors(errs);
                    setLastAction(`${errs.length} error(s)`, 'error');
                }
            }
            catch (e) {
                setValid(false);
                setErrors([{ path: '/', message: e.message }]);
            }
        }, 500);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [state.data, state.schema, setLastAction]);
    const loadTemplate = useCallback((name) => {
        const tmpl = TEMPLATES[name];
        if (tmpl)
            updateState({ schema: tmpl });
    }, [updateState]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("span", { className: "font-pixel text-xs text-[var(--color-text-muted)]", children: "Templates:" }), Object.keys(TEMPLATES).map((name) => (_jsx("button", { onClick: () => loadTemplate(name), className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]", children: name }, name))), _jsxs("div", { className: "ml-auto", children: [valid === true && _jsx("span", { className: "text-xs text-[var(--color-success)]", children: "\u2713 Valid" }), valid === false && _jsxs("span", { className: "text-xs text-[var(--color-error)]", children: ["\u2717 Invalid (", errors.length, " errors)"] })] })] }), errors.length > 0 && (_jsx("div", { className: "max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2", children: errors.map((e, i) => (_jsxs("div", { className: "text-xs text-[var(--color-error)]", children: [_jsx("span", { className: "text-[var(--color-text-muted)]", children: e.path }), " ", e.message] }, i))) })), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "flex w-1/2 flex-col border-r border-[var(--color-border)]", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "JSON Data" }), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: "json", value: state.data, onChange: (v) => updateState({ data: v ?? '' }), options: EDITOR_OPTIONS }) })] }), _jsxs("div", { className: "flex w-1/2 flex-col", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "JSON Schema" }), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: "json", value: state.schema, onChange: (v) => updateState({ schema: v ?? '' }), options: EDITOR_OPTIONS }) })] })] })] }));
}
