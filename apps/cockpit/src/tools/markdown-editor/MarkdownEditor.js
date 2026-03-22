import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useToolState } from '@/hooks/useToolState';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { TabBar } from '@/components/shared/TabBar';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
// Markdown pipeline imports
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
const MODES = [
    { id: 'split', label: 'Split' },
    { id: 'edit', label: 'Edit' },
    { id: 'preview', label: 'Preview' },
];
const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeHighlight, { detect: true })
    .use(rehypeStringify, { allowDangerousHtml: true });
export default function MarkdownEditor() {
    useMonacoTheme();
    const [state, updateState] = useToolState('markdown-editor', {
        content: '',
        mode: 'split',
    });
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [html, setHtml] = useState('');
    const previewRef = useRef(null);
    const debounceRef = useRef(null);
    // Render markdown to HTML (debounced 300ms)
    useEffect(() => {
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (!state.content.trim()) {
                setHtml('');
                return;
            }
            try {
                const result = await processor.process(state.content);
                setHtml(String(result));
            }
            catch (e) {
                setHtml(`<p style="color: var(--color-error)">Render error: ${e.message}</p>`);
            }
        }, 300);
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, [state.content]);
    // Render mermaid diagrams after HTML updates
    useEffect(() => {
        if (!html || !previewRef.current)
            return;
        const mermaidBlocks = previewRef.current.querySelectorAll('code.language-mermaid');
        if (mermaidBlocks.length === 0)
            return;
        // Lazy-load mermaid only when needed
        import('mermaid').then(({ default: mermaid }) => {
            mermaid.initialize({ startOnLoad: false, theme: 'dark' });
            mermaidBlocks.forEach(async (block, i) => {
                const parent = block.parentElement;
                if (!parent)
                    return;
                try {
                    const { svg } = await mermaid.render(`mermaid-${i}`, block.textContent ?? '');
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mermaid-diagram';
                    wrapper.innerHTML = svg;
                    parent.replaceWith(wrapper);
                }
                catch {
                    // Leave as code block on error
                }
            });
        });
    }, [html]);
    const handleExportHtml = useCallback(() => {
        const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Export</title>
<style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style>
</head><body>${html}</body></html>`;
        navigator.clipboard.writeText(fullHtml);
        setLastAction('HTML copied to clipboard', 'success');
    }, [html, setLastAction]);
    const showEditor = state.mode === 'split' || state.mode === 'edit';
    const showPreview = state.mode === 'split' || state.mode === 'preview';
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-2", children: [_jsx(TabBar, { tabs: MODES, activeTab: state.mode, onTabChange: (id) => updateState({ mode: id }) }), _jsxs("div", { className: "ml-auto flex items-center gap-2 py-2", children: [_jsx("button", { onClick: handleExportHtml, className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: "Export HTML" }), _jsx(CopyButton, { text: state.content, label: "Copy MD" })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [showEditor && (_jsx("div", { className: `${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'}`, children: _jsx(Editor, { language: "markdown", value: state.content, onChange: (v) => updateState({ content: v ?? '' }), options: EDITOR_OPTIONS }) })), showPreview && (_jsx("div", { ref: previewRef, className: `${showEditor ? 'w-1/2' : 'w-full'} overflow-auto p-6`, children: html ? (_jsx("div", { className: "prose prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_code]:rounded [&_code]:bg-[var(--color-surface)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:font-pixel [&_h1]:text-[var(--color-accent)] [&_h2]:font-pixel [&_h2]:text-[var(--color-accent)] [&_h3]:font-pixel [&_hr]:border-[var(--color-border)] [&_pre]:rounded [&_pre]:border [&_pre]:border-[var(--color-border)] [&_pre]:bg-[var(--color-surface)] [&_pre]:p-4 [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--color-border)] [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-[var(--color-border)] [&_th]:bg-[var(--color-surface)] [&_th]:px-3 [&_th]:py-1.5", dangerouslySetInnerHTML: { __html: html } })) : (_jsx("div", { className: "text-sm text-[var(--color-text-muted)]", children: "Start typing markdown in the editor..." })) }))] })] }));
}
