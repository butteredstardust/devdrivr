import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { html as diff2htmlRender } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { useWorker } from '@/hooks/useWorker';
import { useUiStore } from '@/stores/ui.store';
export default function DiffViewer() {
    useMonacoTheme();
    const [state, updateState] = useToolState('diff-viewer', {
        left: '',
        right: '',
        mode: 'side-by-side',
        ignoreWhitespace: false,
        jsonMode: false,
    });
    const worker = useWorker(() => new Worker(new URL('../../workers/diff.worker.ts', import.meta.url), { type: 'module' }));
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [diffHtml, setDiffHtml] = useState('');
    const computeDiff = useCallback(async () => {
        if (!worker)
            return;
        const patch = await worker.computeDiff(state.left, state.right, {
            ignoreWhitespace: state.ignoreWhitespace,
            jsonMode: state.jsonMode,
        });
        const rendered = diff2htmlRender(patch, {
            outputFormat: state.mode === 'side-by-side' ? 'side-by-side' : 'line-by-line',
            drawFileList: false,
        });
        setDiffHtml(rendered);
        setLastAction('Diff computed', 'success');
    }, [worker, state, setLastAction]);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("button", { onClick: computeDiff, className: "rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "Compare" }), diffHtml && (_jsx("button", { onClick: () => setDiffHtml(''), className: "rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]", children: "Edit" })), _jsxs("select", { value: state.mode, onChange: (e) => updateState({ mode: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: "side-by-side", children: "Side by Side" }), _jsx("option", { value: "inline", children: "Inline" })] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: [_jsx("input", { type: "checkbox", checked: state.ignoreWhitespace, onChange: (e) => updateState({ ignoreWhitespace: e.target.checked }), className: "accent-[var(--color-accent)]" }), "Ignore whitespace"] }), _jsxs("label", { className: "flex items-center gap-1 text-xs text-[var(--color-text-muted)]", children: [_jsx("input", { type: "checkbox", checked: state.jsonMode, onChange: (e) => updateState({ jsonMode: e.target.checked }), className: "accent-[var(--color-accent)]" }), "JSON mode"] })] }), diffHtml ? (_jsx("div", { className: "flex-1 overflow-auto bg-[var(--color-surface)] p-2 text-xs", dangerouslySetInnerHTML: { __html: diffHtml } })) : (_jsxs("div", { className: "flex flex-1 gap-px bg-[var(--color-border)]", children: [_jsxs("div", { className: "flex flex-1 flex-col", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Left (original)" }), _jsx("div", { className: "flex-1", children: _jsx(Editor, { value: state.left, onChange: (v) => updateState({ left: v ?? '' }), options: { ...EDITOR_OPTIONS, wordWrap: 'off' } }) })] }), _jsxs("div", { className: "flex flex-1 flex-col", children: [_jsx("div", { className: "border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]", children: "Right (modified)" }), _jsx("div", { className: "flex-1", children: _jsx(Editor, { value: state.right, onChange: (v) => updateState({ right: v ?? '' }), options: { ...EDITOR_OPTIONS, wordWrap: 'off' } }) })] })] }))] }));
}
