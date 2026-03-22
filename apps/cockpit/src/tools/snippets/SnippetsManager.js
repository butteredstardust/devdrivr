import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import Fuse from 'fuse.js';
import { useSnippetsStore } from '@/stores/snippets.store';
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco';
import { CopyButton } from '@/components/shared/CopyButton';
import { useUiStore } from '@/stores/ui.store';
const LANGUAGES = [
    'javascript', 'typescript', 'json', 'css', 'html', 'markdown',
    'sql', 'python', 'yaml', 'xml', 'bash', 'text',
];
export default function SnippetsManager() {
    useMonacoTheme();
    const snippets = useSnippetsStore((s) => s.snippets);
    const addSnippet = useSnippetsStore((s) => s.add);
    const updateSnippet = useSnippetsStore((s) => s.update);
    const removeSnippet = useSnippetsStore((s) => s.remove);
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [tagInput, setTagInput] = useState('');
    const fuse = useMemo(() => new Fuse(snippets, { keys: ['title', 'content', 'tags'], threshold: 0.4 }), [snippets]);
    const filtered = useMemo(() => {
        if (!search.trim())
            return snippets;
        return fuse.search(search).map((r) => r.item);
    }, [snippets, search, fuse]);
    const selected = useMemo(() => snippets.find((s) => s.id === selectedId) ?? null, [snippets, selectedId]);
    const handleNew = useCallback(async () => {
        const snippet = await addSnippet('Untitled', '', 'javascript');
        setSelectedId(snippet.id);
        setLastAction('Snippet created', 'success');
    }, [addSnippet, setLastAction]);
    const handleDelete = useCallback(async () => {
        if (!selectedId)
            return;
        await removeSnippet(selectedId);
        setSelectedId(null);
        setLastAction('Snippet deleted', 'info');
    }, [selectedId, removeSnippet, setLastAction]);
    const handleAddTag = useCallback(() => {
        if (!selected || !tagInput.trim())
            return;
        const newTags = [...selected.tags, tagInput.trim()];
        updateSnippet(selected.id, { tags: newTags });
        setTagInput('');
    }, [selected, tagInput, updateSnippet]);
    const handleRemoveTag = useCallback((tag) => {
        if (!selected)
            return;
        updateSnippet(selected.id, { tags: selected.tags.filter((t) => t !== tag) });
    }, [selected, updateSnippet]);
    const handleExport = useCallback(() => {
        const data = JSON.stringify(snippets, null, 2);
        navigator.clipboard.writeText(data);
        setLastAction(`Exported ${snippets.length} snippets to clipboard`, 'success');
    }, [snippets, setLastAction]);
    const handleImport = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            const imported = JSON.parse(text);
            for (const item of imported) {
                if (typeof item['title'] === 'string' && typeof item['content'] === 'string') {
                    await addSnippet(item['title'], item['content'], typeof item['language'] === 'string' ? item['language'] : 'text', Array.isArray(item['tags']) ? item['tags'] : []);
                }
            }
            setLastAction(`Imported ${imported.length} snippets`, 'success');
        }
        catch {
            setLastAction('Import failed — paste valid JSON array', 'error');
        }
    }, [addSnippet, setLastAction]);
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "flex w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2", children: [_jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search snippets...", className: "flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]" }), _jsx("button", { onClick: handleNew, className: "rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "+" })] }), _jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1", children: [_jsx("button", { onClick: handleExport, className: "text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: "Export" }), _jsx("button", { onClick: handleImport, className: "text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: "Import" })] }), _jsxs("div", { className: "flex-1 overflow-auto", children: [filtered.map((snippet) => (_jsxs("button", { onClick: () => setSelectedId(snippet.id), className: `flex w-full flex-col border-b border-[var(--color-border)] px-3 py-2 text-left ${selectedId === snippet.id ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'}`, children: [_jsx("span", { className: "text-xs font-bold text-[var(--color-text)]", children: snippet.title || 'Untitled' }), _jsx("span", { className: "text-[10px] text-[var(--color-text-muted)]", children: snippet.language }), snippet.tags.length > 0 && (_jsx("div", { className: "mt-0.5 flex flex-wrap gap-1", children: snippet.tags.map((tag) => (_jsx("span", { className: "rounded bg-[var(--color-accent-dim)] px-1 text-[10px] text-[var(--color-accent)]", children: tag }, tag))) }))] }, snippet.id))), filtered.length === 0 && (_jsx("div", { className: "p-4 text-center text-xs text-[var(--color-text-muted)]", children: search ? 'No matching snippets' : 'No snippets yet' }))] })] }), selected ? (_jsxs("div", { className: "flex flex-1 flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("input", { value: selected.title, onChange: (e) => updateSnippet(selected.id, { title: e.target.value }), placeholder: "Snippet title", className: "flex-1 bg-transparent text-sm font-bold text-[var(--color-text)] outline-none" }), _jsx("select", { value: selected.language, onChange: (e) => updateSnippet(selected.id, { language: e.target.value }), className: "rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none", children: LANGUAGES.map((l) => _jsx("option", { value: l, children: l }, l)) }), _jsx(CopyButton, { text: selected.content }), _jsx("button", { onClick: handleDelete, className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]", children: "Delete" })] }), _jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1", children: [selected.tags.map((tag) => (_jsxs("span", { className: "flex items-center gap-1 rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-xs text-[var(--color-accent)]", children: [tag, _jsx("button", { onClick: () => handleRemoveTag(tag), className: "hover:text-[var(--color-error)]", children: "\u00D7" })] }, tag))), _jsx("input", { value: tagInput, onChange: (e) => setTagInput(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                    handleAddTag(); }, placeholder: "Add tag...", className: "bg-transparent text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none" })] }), _jsx("div", { className: "flex-1", children: _jsx(Editor, { language: selected.language, value: selected.content, onChange: (v) => updateSnippet(selected.id, { content: v ?? '' }), options: EDITOR_OPTIONS }) })] })) : (_jsx("div", { className: "flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]", children: "Select a snippet or create a new one" }))] }));
}
