import { create } from 'zustand';
export const useToolStateCache = create()((set, get) => ({
    cache: new Map(),
    set: (toolId, state) => set((s) => {
        const next = new Map(s.cache);
        next.set(toolId, state);
        return { cache: next };
    }),
    get: (toolId) => get().cache.get(toolId),
}));
