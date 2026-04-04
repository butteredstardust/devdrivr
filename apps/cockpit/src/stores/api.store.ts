import { create } from 'zustand'
import {
  loadApiCollections,
  loadApiEnvironments,
  loadApiRequests,
  saveApiCollection,
  saveApiEnvironment,
  saveApiRequest,
  deleteApiCollection,
  deleteApiEnvironment,
  deleteApiRequest,
  loadHistory,
  addHistoryEntry,
} from '@/lib/db'
import type { ApiCollection, ApiEnvironment, ApiRequest, HistoryEntry } from '@/types/models'

const API_CLIENT_HISTORY_TOOL = 'api-client'
const API_CLIENT_HISTORY_LIMIT = 30

type ApiStore = {
  environments: ApiEnvironment[]
  collections: ApiCollection[]
  requests: ApiRequest[]
  activeEnvironmentId: string | null
  requestHistory: HistoryEntry[]

  // Actions
  init: () => Promise<void>

  createEnvironment: (name: string, variables: Record<string, string>) => Promise<ApiEnvironment>
  updateEnvironment: (env: ApiEnvironment) => Promise<void>
  deleteEnvironment: (id: string) => Promise<void>
  setActiveEnvironmentId: (id: string | null) => void

  createCollection: (name: string) => Promise<ApiCollection>
  updateCollection: (col: ApiCollection) => Promise<void>
  deleteCollection: (id: string) => Promise<void>

  createRequest: (req: Omit<ApiRequest, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ApiRequest>
  updateRequest: (req: ApiRequest) => Promise<void>
  deleteRequest: (id: string) => Promise<void>

  addRequestHistory: (entry: Omit<HistoryEntry, 'id' | 'tool' | 'timestamp'>) => Promise<void>
}

let initPromise: Promise<void> | null = null

export const useApiStore = create<ApiStore>((set) => ({
  environments: [],
  collections: [],
  requests: [],
  activeEnvironmentId: null,
  requestHistory: [],

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const [envs, cols, reqs, hist] = await Promise.all([
          loadApiEnvironments(),
          loadApiCollections(),
          loadApiRequests(),
          loadHistory(API_CLIENT_HISTORY_TOOL, API_CLIENT_HISTORY_LIMIT),
        ])
        set({
          environments: envs,
          collections: cols,
          requests: reqs,
          requestHistory: hist,
          // Could restore this from settings later
          activeEnvironmentId: envs[0]?.id ?? null,
        })
      })()
    }
    return initPromise
  },

  createEnvironment: async (name, variables) => {
    const env: ApiEnvironment = {
      id: crypto.randomUUID(),
      name,
      variables,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveApiEnvironment(env)
    set((state) => ({ environments: [env, ...state.environments] }))
    return env
  },

  updateEnvironment: async (env) => {
    const updated = { ...env, updatedAt: Date.now() }
    await saveApiEnvironment(updated)
    set((state) => ({
      environments: state.environments.map((e) => (e.id === updated.id ? updated : e)),
    }))
  },

  deleteEnvironment: async (id) => {
    await deleteApiEnvironment(id)
    set((state) => ({
      environments: state.environments.filter((e) => e.id !== id),
      activeEnvironmentId: state.activeEnvironmentId === id ? null : state.activeEnvironmentId,
    }))
  },

  setActiveEnvironmentId: (id) => set({ activeEnvironmentId: id }),

  createCollection: async (name) => {
    const col: ApiCollection = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveApiCollection(col)
    set((state) => ({
      collections: [...state.collections, col].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    return col
  },

  updateCollection: async (col) => {
    const updated = { ...col, updatedAt: Date.now() }
    await saveApiCollection(updated)
    set((state) => ({
      collections: state.collections
        .map((c) => (c.id === updated.id ? updated : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
  },

  deleteCollection: async (id) => {
    await deleteApiCollection(id)
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
    }))
  },

  createRequest: async (draft) => {
    const req: ApiRequest = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await saveApiRequest(req)
    set((state) => ({
      requests: [...state.requests, req].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    return req
  },

  updateRequest: async (req) => {
    const updated = { ...req, updatedAt: Date.now() }
    await saveApiRequest(updated)
    set((state) => ({
      requests: state.requests
        .map((r) => (r.id === updated.id ? updated : r))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
  },

  deleteRequest: async (id) => {
    await deleteApiRequest(id)
    set((state) => ({
      requests: state.requests.filter((r) => r.id !== id),
    }))
  },

  addRequestHistory: async ({ subTab, input, output }) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      tool: API_CLIENT_HISTORY_TOOL,
      ...(subTab !== undefined ? { subTab } : {}),
      input,
      output,
      timestamp: Date.now(),
    }
    await addHistoryEntry(entry)
    set((state) => ({
      requestHistory: [entry, ...state.requestHistory].slice(0, API_CLIENT_HISTORY_LIMIT),
    }))
  },
}))
