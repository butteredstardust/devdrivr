import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { loadHistory, addHistoryEntry, pruneHistory } from '@/lib/db';
export const useHistoryStore = create()((set) => ({
    entries: [],
    initialized: false,
    init: async () => {
        const entries = await loadHistory(undefined, 200);
        set({ entries, initialized: true });
    },
    add: async (tool, input, output, subTab) => {
        const entry = {
            id: nanoid(),
            tool,
            input,
            output,
            timestamp: Date.now(),
        };
        if (subTab != null) {
            entry.subTab = subTab;
        }
        await addHistoryEntry(entry);
        // Prune to keep max 500 per tool
        await pruneHistory(tool, 500);
        set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) }));
    },
    loadForTool: async (tool) => {
        return loadHistory(tool, 100);
    },
    reload: async () => {
        const entries = await loadHistory(undefined, 200);
        set({ entries });
    },
}));
