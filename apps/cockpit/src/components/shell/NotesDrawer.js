import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { useSettingsStore } from '@/stores/settings.store';
import { useNotesStore } from '@/stores/notes.store';
import { useHistoryStore } from '@/stores/history.store';
import { useUiStore } from '@/stores/ui.store';
import { TabBar } from '@/components/shared/TabBar';
const DRAWER_TABS = [
    { id: 'notes', label: 'Notes' },
    { id: 'history', label: 'History' },
];
const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray'];
const COLOR_MAP = {
    yellow: 'bg-yellow-500/20 border-yellow-500/30',
    green: 'bg-green-500/20 border-green-500/30',
    blue: 'bg-blue-500/20 border-blue-500/30',
    pink: 'bg-pink-500/20 border-pink-500/30',
    purple: 'bg-purple-500/20 border-purple-500/30',
    orange: 'bg-orange-500/20 border-orange-500/30',
    red: 'bg-red-500/20 border-red-500/30',
    gray: 'bg-gray-500/20 border-gray-500/30',
};
export function NotesDrawer() {
    const drawerOpen = useSettingsStore((s) => s.notesDrawerOpen);
    const notes = useNotesStore((s) => s.notes);
    const addNote = useNotesStore((s) => s.add);
    const updateNote = useNotesStore((s) => s.update);
    const removeNote = useNotesStore((s) => s.remove);
    const historyEntries = useHistoryStore((s) => s.entries);
    const setActiveTool = useUiStore((s) => s.setActiveTool);
    const setLastAction = useUiStore((s) => s.setLastAction);
    const [activeTab, setActiveTab] = useState('notes');
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [historyFilter, setHistoryFilter] = useState('');
    const fuse = useMemo(() => new Fuse(notes, { keys: ['title', 'content'], threshold: 0.4 }), [notes]);
    const filteredNotes = useMemo(() => {
        if (!search.trim())
            return notes;
        return fuse.search(search).map((r) => r.item);
    }, [notes, search, fuse]);
    const filteredHistory = useMemo(() => {
        if (!historyFilter)
            return historyEntries;
        return historyEntries.filter((e) => e.tool === historyFilter);
    }, [historyEntries, historyFilter]);
    const handleAddNote = useCallback(async () => {
        const note = await addNote('New note', '', 'yellow');
        setEditingId(note.id);
        setLastAction('Note created', 'success');
    }, [addNote, setLastAction]);
    const handleDelete = useCallback(async (id) => {
        await removeNote(id);
        setLastAction('Note deleted', 'info');
    }, [removeNote, setLastAction]);
    const handlePopOut = useCallback(async (note) => {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const label = `note-${note.id}`;
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
            await existing.setFocus();
            return;
        }
        const bounds = note.windowBounds;
        const noteWindow = new WebviewWindow(label, {
            url: `/?note=${note.id}`,
            title: note.title || 'Note',
            width: bounds?.width ?? 320,
            height: bounds?.height ?? 400,
            ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
            alwaysOnTop: true,
            decorations: true,
            center: !bounds,
        });
        noteWindow.once('tauri://error', (e) => {
            console.error('Failed to create note window:', e);
        });
        noteWindow.onMoved(async () => {
            const pos = await noteWindow.outerPosition();
            const sz = await noteWindow.outerSize();
            await updateNote(note.id, {
                windowBounds: { x: pos.x, y: pos.y, width: sz.width, height: sz.height },
            });
        });
        noteWindow.onResized(async () => {
            const pos = await noteWindow.outerPosition();
            const sz = await noteWindow.outerSize();
            await updateNote(note.id, {
                windowBounds: { x: pos.x, y: pos.y, width: sz.width, height: sz.height },
            });
        });
        await updateNote(note.id, { poppedOut: true });
        setLastAction('Note popped out', 'info');
    }, [updateNote, setLastAction]);
    const handleHistoryReplay = useCallback((tool, _input) => {
        setActiveTool(tool);
        setLastAction(`Switched to ${tool}`, 'info');
    }, [setActiveTool, setLastAction]);
    if (!drawerOpen)
        return null;
    return (_jsxs("aside", { className: "flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]", children: [_jsx("div", { className: "border-b border-[var(--color-border)]", children: _jsx(TabBar, { tabs: DRAWER_TABS, activeTab: activeTab, onTabChange: setActiveTab }) }), activeTab === 'notes' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2", children: [_jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search notes...", className: "flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]" }), _jsx("button", { onClick: handleAddNote, className: "rounded border border-[var(--color-accent)] px-2 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]", children: "+" })] }), _jsxs("div", { className: "flex-1 overflow-auto p-2", children: [filteredNotes.length === 0 && (_jsx("div", { className: "p-4 text-center text-xs text-[var(--color-text-muted)]", children: search ? 'No matching notes' : 'No notes yet — click + to create one' })), filteredNotes.map((note) => (_jsx("div", { className: `mb-2 rounded border p-2 ${COLOR_MAP[note.color] ?? 'bg-[var(--color-surface)] border-[var(--color-border)]'}`, children: editingId === note.id ? (_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("input", { value: note.title, onChange: (e) => updateNote(note.id, { title: e.target.value }), placeholder: "Title", className: "bg-transparent text-xs font-bold text-[var(--color-text)] outline-none", autoFocus: true }), _jsx("textarea", { value: note.content, onChange: (e) => updateNote(note.id, { content: e.target.value }), placeholder: "Write something...", rows: 4, className: "resize-none bg-transparent text-xs text-[var(--color-text)] outline-none" }), _jsx("div", { className: "flex items-center gap-1", children: NOTE_COLORS.map((c) => (_jsx("button", { onClick: () => updateNote(note.id, { color: c }), className: `h-4 w-4 rounded-full border ${note.color === c ? 'ring-2 ring-[var(--color-accent)]' : ''}`, style: { backgroundColor: `var(--note-${c}, ${c})` }, title: c }, c))) }), _jsx("button", { onClick: () => setEditingId(null), className: "mt-1 self-end text-xs text-[var(--color-accent)] hover:underline", children: "Done" })] })) : (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "cursor-pointer text-xs font-bold text-[var(--color-text)] hover:underline", onClick: () => setEditingId(note.id), children: note.title || 'Untitled' }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => updateNote(note.id, { pinned: !note.pinned }), className: `text-xs ${note.pinned ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`, title: note.pinned ? 'Unpin' : 'Pin', children: note.pinned ? '★' : '☆' }), _jsx("button", { onClick: () => handlePopOut(note), className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]", title: "Pop out", children: "\u29C9" }), _jsx("button", { onClick: () => handleDelete(note.id), className: "text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]", title: "Delete", children: "\u00D7" })] })] }), note.content && (_jsx("p", { className: "mt-1 line-clamp-3 text-xs text-[var(--color-text-muted)]", children: note.content })), _jsx("div", { className: "mt-1 text-[10px] text-[var(--color-text-muted)]", children: new Date(note.updatedAt).toLocaleDateString() })] })) }, note.id)))] })] })), activeTab === 'history' && (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2", children: _jsxs("select", { value: historyFilter, onChange: (e) => setHistoryFilter(e.target.value), className: "flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none", children: [_jsx("option", { value: "", children: "All tools" }), Array.from(new Set(historyEntries.map((e) => e.tool))).map((tool) => (_jsx("option", { value: tool, children: tool }, tool)))] }) }), _jsxs("div", { className: "flex-1 overflow-auto p-2", children: [filteredHistory.length === 0 && (_jsx("div", { className: "p-4 text-center text-xs text-[var(--color-text-muted)]", children: "No history yet" })), filteredHistory.map((entry) => (_jsxs("div", { className: "mb-2 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 hover:bg-[var(--color-surface-hover)]", onClick: () => handleHistoryReplay(entry.tool, entry.input), children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-bold text-[var(--color-accent)]", children: entry.tool }), _jsx("span", { className: "text-[10px] text-[var(--color-text-muted)]", children: new Date(entry.timestamp).toLocaleTimeString() })] }), _jsxs("p", { className: "mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]", children: [entry.input.slice(0, 100), entry.input.length > 100 ? '...' : ''] })] }, entry.id)))] })] }))] }));
}
