import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { useWorker } from '@/hooks/useWorker';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
const EXAMPLE = `interface User {
  id: number
  name: string
  email: string
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
]

const greeting = users.map(greet)
console.log(greeting)
`;
export default function TsPlayground() {
    useMonacoTheme();
    const [state, updateState] = useToolState('ts-playground', {
        input: EXAMPLE,
        target: 'ESNext',
        module: 'ESNext',
        strict: true,
    });
    const worker = useWorker(() => new Worker(new URL('../../workers/typescript.worker.ts', import.meta.url), {
        type: 'module',
    }));
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [output, setOutput] = useState('');
    const [diagnostics, setDiagnostics] = useState([]);
    const debounceRef = useRef(null);
    const handleTranspile = useCallback(async () => {
        if (!worker)
            return;
        if (!state.input.trim()) {
            setOutput('');
            setDiagnostics([]);
            return;
        }
        try {
            const result = await worker.transpile(state.input, {
                target: state.target,
                module: state.module,
                strict: state.strict,
            });
            setOutput(result.output);
            setDiagnostics(result.diagnostics);
            if (result.diagnostics.length > 0) {
                setLastAction(`${result.diagnostics.length} diagnostic(s)`, 'info');
            }
        }
        catch (e) {
            setOutput(`// Error: ${e.message}`);
            setDiagnostics([]);
        }
    }, [worker, state.input, state.target, state.module, state.strict, setLastAction]);
    // Auto-transpile on input/option change (debounced 500ms)
    useEffect(() => {
        if (!worker)
            return;
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            void handleTranspile();
        }, 500);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [worker, state.input, state.target, state.module, state.strict, handleTranspile]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: ["Target", _jsxs("select", { value: state.target, onChange: (e) => updateState({ target: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: "ES5", children: "ES5" }), _jsx("option", { value: "ES2015", children: "ES2015" }), _jsx("option", { value: "ES2020", children: "ES2020" }), _jsx("option", { value: "ESNext", children: "ESNext" })] })] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: ["Module", _jsxs("select", { value: state.module, onChange: (e) => updateState({ module: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: "ESNext", children: "ESNext" }), _jsx("option", { value: "CommonJS", children: "CommonJS" }), _jsx("option", { value: "None", children: "None" })] })] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: [_jsx("input", { type: "checkbox", checked: state.strict, onChange: (e) => updateState({ strict: e.target.checked }), className: "accent-[var(--color-accent)]" }), "Strict"] }), _jsx("div", { className: "ml-auto flex items-center gap-2", children: _jsx(CopyButton, { text: output, label: "Copy Output" }) })] }), diagnostics.length > 0 && (_jsx("div", { className: "max-h-20 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2", children: diagnostics.map((d, i) => (_jsxs("div", { className: "text-xs text-[var(--color-warning)]", children: [d.line ? `Line ${d.line}: ` : '', d.message] }, i))) })), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx("div", { className: "w-1/2 border-r border-[var(--color-border)]", children: _jsx(Editor, { language: "typescript", value: state.input, onChange: (v) => updateState({ input: v ?? '' }), options: EDITOR_OPTIONS }) }), _jsx("div", { className: "w-1/2", children: _jsx(Editor, { language: "javascript", value: output, options: { ...EDITOR_OPTIONS, readOnly: true } }) })] })] }));
}
