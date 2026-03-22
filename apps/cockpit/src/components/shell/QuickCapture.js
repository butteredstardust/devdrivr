import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { useNotesStore } from '@/stores/notes.store';
import { useSettingsStore } from '@/stores/settings.store';
import { getCurrentWindow } from '@tauri-apps/api/window';
export function QuickCapture() {
    const [content, setContent] = useState('');
    const addNote = useNotesStore((s) => s.add);
    const notesInit = useNotesStore((s) => s.initialized);
    const initNotes = useNotesStore((s) => s.init);
    const settingsInit = useSettingsStore((s) => s.initialized);
    const initSettings = useSettingsStore((s) => s.init);
    // Pop-out windows bypass <Providers>, so init settings (for theme) and notes store
    useEffect(() => {
        if (!settingsInit) {
            initSettings();
        }
        if (!notesInit) {
            initNotes();
        }
    }, [settingsInit, notesInit, initSettings, initNotes]);
    const handleSave = useCallback(async () => {
        if (!content.trim())
            return;
        await addNote('Quick note', content.trim());
        await getCurrentWindow().close();
    }, [content, addNote]);
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            handleSave();
        }
        if (e.key === 'Escape') {
            getCurrentWindow().close();
        }
    }, [handleSave]);
    return (_jsxs("div", { className: "flex h-full flex-col bg-[var(--color-bg)] p-3", children: [_jsx("textarea", { value: content, onChange: (e) => setContent(e.target.value), onKeyDown: handleKeyDown, placeholder: "Quick note... (Cmd+Enter to save, Esc to close)", className: "flex-1 resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]", autoFocus: true }), _jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [_jsx("button", { onClick: () => getCurrentWindow().close(), className: "rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]", children: "Cancel" }), _jsx("button", { onClick: handleSave, disabled: !content.trim(), className: "rounded border border-[var(--color-accent)] px-3 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-50", children: "Save" })] })] }));
}
