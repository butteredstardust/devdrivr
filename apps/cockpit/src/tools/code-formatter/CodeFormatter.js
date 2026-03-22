import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { useWorker } from '@/hooks/useWorker';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut';
const LANGUAGES = [
    'javascript', 'typescript', 'json', 'css', 'scss', 'less',
    'html', 'markdown', 'yaml', 'xml', 'sql', 'graphql',
];
export default function CodeFormatter() {
    useMonacoTheme();
    const [state, updateState] = useToolState('code-formatter', {
        input: '',
        language: 'javascript',
        tabWidth: 2,
        singleQuote: true,
        trailingComma: 'es5',
        semi: false,
    });
    const formatter = useWorker(() => new Worker(new URL('../../workers/formatter.worker.ts', import.meta.url), { type: 'module' }));
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [error, setError] = useState(null);
    const handleFormat = useCallback(async () => {
        if (!formatter || !state.input.trim())
            return;
        try {
            const result = await formatter.format(state.input, {
                language: state.language,
                tabWidth: state.tabWidth,
                singleQuote: state.singleQuote,
                trailingComma: state.trailingComma,
                semi: state.semi,
            });
            updateState({ input: result });
            setError(null);
            setLastAction('Formatted', 'success');
        }
        catch (e) {
            const msg = e.message;
            setError(msg);
            setLastAction('Format error', 'error');
        }
    }, [formatter, state, updateState, setLastAction]);
    const handleAutoDetect = useCallback(async () => {
        if (!formatter || !state.input.trim())
            return;
        const detected = await formatter.detectLanguage(state.input);
        updateState({ language: detected });
        setLastAction(`Detected: ${detected}`, 'info');
    }, [formatter, state.input, updateState, setLastAction]);
    // Cmd/Ctrl+Enter to format
    useKeyboardShortcut({ key: 'Enter', mod: true }, handleFormat);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("button", { onClick: handleFormat, className: "rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "Format" }), _jsx("select", { value: state.language, onChange: (e) => updateState({ language: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none", children: LANGUAGES.map((lang) => (_jsx("option", { value: lang, children: lang }, lang))) }), _jsx("button", { onClick: handleAutoDetect, className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: "Auto-detect" }), _jsx("div", { className: "mx-2 h-4 w-px bg-[var(--color-border)]" }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: ["Indent", _jsxs("select", { value: state.tabWidth, onChange: (e) => updateState({ tabWidth: Number(e.target.value) }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: 2, children: "2" }), _jsx("option", { value: 4, children: "4" })] })] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: [_jsx("input", { type: "checkbox", checked: state.singleQuote, onChange: (e) => updateState({ singleQuote: e.target.checked }), className: "accent-[var(--color-accent)]" }), "Single quotes"] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: [_jsx("input", { type: "checkbox", checked: state.semi, onChange: (e) => updateState({ semi: e.target.checked }), className: "accent-[var(--color-accent)]" }), "Semicolons"] }), _jsx("div", { className: "ml-auto", children: _jsx(CopyButton, { text: state.input }) })] }), error && (_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]", children: error })), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: state.language, value: state.input, onChange: (v) => updateState({ input: v ?? '' }), options: EDITOR_OPTIONS }) })] }));
}
