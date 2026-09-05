import { create } from 'zustand'
import {
  loadApiCollections,
  loadApiEnvironments,
  loadApiRequests,
  saveApiCollection,
  saveApiEnvironment,
  saveApiImport,
  saveApiRequest,
  deleteApiCollection,
  deleteApiEnvironment,
  deleteApiRequest,
  loadHistory,
  addHistoryEntry,
  getSetting,
  setSetting,
} from '@/lib/db'
import type { ApiCollection, ApiEnvironment, ApiRequest, HistoryEntry } from '@/types/models'
import type { ApiImportResult } from '@/types/models'

const API_CLIENT_HISTORY_TOOL = 'api-client'
const API_CLIENT_HISTORY_LIMIT = 30

type ApiStore = {
  initialized: boolean
  environments: ApiEnvironment[]
  collections: ApiCollection[]
  requests: ApiRequest[]
  activeEnvironmentId: string | null
  requestHistory: HistoryEntry[]

  // Actions
  init: () => Promise<void>
  refresh: () => Promise<void>

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
  importApiData: (data: ApiImportResult) => Promise<{ collections: number; requests: number }>

  addRequestHistory: (entry: Omit<HistoryEntry, 'id' | 'tool' | 'timestamp'>) => Promise<void>
}

let initPromise: Promise<void> | null = null

const ACTIVE_ENVIRONMENT_SETTING = 'apiActiveEnvironmentId'

export const useApiStore = create<ApiStore>((set) => ({
  initialized: false,
  environments: [],
  collections: [],
  requests: [],
  activeEnvironmentId: null,
  requestHistory: [],

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const [envs, cols, reqs, hist, savedEnvId] = await Promise.all([
          loadApiEnvironments(),
          loadApiCollections(),
          loadApiRequests(),
          loadHistory(API_CLIENT_HISTORY_TOOL, API_CLIENT_HISTORY_LIMIT),
          getSetting<string | null>(ACTIVE_ENVIRONMENT_SETTING, null),
        ])
        set({
          initialized: true,
          environments: envs,
          collections: cols,
          requests: reqs,
          requestHistory: hist,
          // Restore the chosen environment, falling back to the first only when the saved one
          // no longer exists — silently reverting to environment A changes resolved endpoints
          // and credentials without the user noticing.
          activeEnvironmentId:
            (savedEnvId && envs.some((e) => e.id === savedEnvId) ? savedEnvId : envs[0]?.id) ??
            null,
        })
      })().catch((err: unknown) => {
        // Clear the cached promise on failure so a later call retries
        // instead of latching a transient error for the process lifetime.
        initPromise = null
        throw err
      })
    }
    return initPromise
  },

  refresh: async () => {
    const [envs, cols, reqs, hist] = await Promise.all([
      loadApiEnvironments(),
      loadApiCollections(),
      loadApiRequests(),
      loadHistory(API_CLIENT_HISTORY_TOOL, API_CLIENT_HISTORY_LIMIT),
    ])
    set((state) => ({
      environments: envs,
      collections: cols,
      requests: reqs,
      requestHistory: hist,
      activeEnvironmentId:
        state.activeEnvironmentId && envs.some((env) => env.id === state.activeEnvironmentId)
          ? state.activeEnvironmentId
          : (envs[0]?.id ?? null),
    }))
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

  setActiveEnvironmentId: (id) => {
    set({ activeEnvironmentId: id })
    void setSetting(ACTIVE_ENVIRONMENT_SETTING, id).catch(() => {
      // A failed write only costs the selection on the next launch; nothing to recover here.
    })
  },

  createCollection: async (name) => {
    const now = Date.now()
    const col: ApiCollection = {
      id: crypto.randomUUID(),
      name,
      parentId: 'api-requests-inbox',
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
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
      requests: state.requests.filter((request) => request.collectionId !== id),
    }))
  },

  createRequest: async (draft) => {
    const req: ApiRequest = {
      ...draft,
      collectionId: draft.collectionId ?? 'api-requests-inbox',
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

  importApiData: async (data) => {
    const now = Date.now()
    const collectionIdByKey = new Map<string, string>()
    for (const collection of data.collections) {
      collectionIdByKey.set(
        collection.key,
        collection.key === 'api-requests-inbox' ? collection.key : crypto.randomUUID()
      )
    }
    const importedCollections: ApiCollection[] = data.collections
      .filter((collection) => collection.key !== 'api-requests-inbox')
      .map((collection) => ({
        id: collectionIdByKey.get(collection.key)!,
        name: collection.name,
        parentId: 'api-requests-inbox',
        sortOrder: collection.sortOrder ?? now,
        createdAt: now,
        updatedAt: now,
      }))
    data.collections
      .filter((collection) => collection.key !== 'api-requests-inbox')
      .forEach((collection, index) => {
        const imported = importedCollections[index]
        if (!imported) return
        imported.parentId = collection.parentKey
          ? (collectionIdByKey.get(collection.parentKey) ?? 'api-requests-inbox')
          : 'api-requests-inbox'
      })
    // The shared-folder trigger requires parents to exist before children. Exported
    // collections may be alphabetical, so normalize them into a parent-first order.
    const pendingCollections = [...importedCollections]
    const orderedCollections: ApiCollection[] = []
    const availableParentIds = new Set(['api-requests-inbox'])
    while (pendingCollections.length > 0) {
      const readyIndex = pendingCollections.findIndex(
        (collection) => !collection.parentId || availableParentIds.has(collection.parentId)
      )
      if (readyIndex < 0) {
        // Malformed cyclic hierarchies remain importable without creating a cycle.
        for (const collection of pendingCollections) collection.parentId = 'api-requests-inbox'
        orderedCollections.push(...pendingCollections)
        break
      }
      const [ready] = pendingCollections.splice(readyIndex, 1)
      if (!ready) continue
      orderedCollections.push(ready)
      availableParentIds.add(ready.id)
    }
    const importedRequests: ApiRequest[] = data.requests.map((request) => ({
      id: crypto.randomUUID(),
      collectionId: request.collectionKey
        ? (collectionIdByKey.get(request.collectionKey) ?? 'api-requests-inbox')
        : 'api-requests-inbox',
      name: request.name,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      bodyMode: request.bodyMode,
      auth: request.auth,
      createdAt: now,
      updatedAt: now,
    }))

    await saveApiImport(orderedCollections, importedRequests)
    set((state) => ({
      collections: [...state.collections, ...orderedCollections].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      requests: [...state.requests, ...importedRequests].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }))
    return { collections: orderedCollections.length, requests: importedRequests.length }
  },

  addRequestHistory: async (entryData) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      tool: API_CLIENT_HISTORY_TOOL,
      ...entryData,
      timestamp: Date.now(),
    }
    await addHistoryEntry(entry)
    set((state) => ({
      requestHistory: [entry, ...state.requestHistory].slice(0, API_CLIENT_HISTORY_LIMIT),
    }))
  },
}))
