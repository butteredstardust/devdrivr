import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadNotes, saveNote, deleteNote } from '@/lib/db';
export const useNotesStore = create()((set, get) => ({
    notes: [],
    initialized: false,
    init: async () => {
        const notes = await loadNotes();
        set({ notes, initialized: true });
    },
    add: async (title = '', content = '', color = 'yellow') => {
        const now = Date.now();
        const note = {
            id: nanoid(),
            title,
            content,
            color,
            pinned: false,
            poppedOut: false,
            createdAt: now,
            updatedAt: now,
        };
        await saveNote(note);
        set((s) => ({ notes: [note, ...s.notes] }));
        return note;
    },
    update: async (id, patch) => {
        const notes = get().notes;
        const idx = notes.findIndex((n) => n.id === id);
        if (idx < 0)
            return;
        const updated = { ...notes[idx], ...patch, updatedAt: Date.now() };
        await saveNote(updated);
        set((s) => ({
            notes: s.notes.map((n) => (n.id === id ? updated : n)),
        }));
    },
    remove: async (id) => {
        await deleteNote(id);
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    },
}));
