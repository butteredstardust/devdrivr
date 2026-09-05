import { nanoid } from 'nanoid'
import { create } from 'zustand'
import {
  loadResourceFolders,
  saveResourceFolder,
  saveResourceFolderMove,
  saveResourceFolderOrder,
} from '@/lib/db'
import type { ResourceFolder, ResourceKind } from '@/types/models'
import { isInboxFolder } from '@/lib/resource-folders'

const SORT_STEP = 1_000

type CreateFolder = {
  name: string
  kind: ResourceKind
  parentId?: string | null
  defaultLanguage?: string
}

type UpdateFolder = Partial<Pick<ResourceFolder, 'name' | 'defaultLanguage'>>

type FoldersStore = {
  folders: ResourceFolder[]
  initialized: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  create: (input: CreateFolder) => Promise<ResourceFolder>
  update: (id: string, patch: UpdateFolder) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  move: (id: string, parentId: string | null, index?: number) => Promise<void>
  reorder: (sourceId: string, targetId: string, position: 'before' | 'after') => Promise<void>
}

let initPromise: Promise<void> | null = null

function sortFolders(folders: ResourceFolder[]): ResourceFolder[] {
  return [...folders].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      (a.parentId ?? '').localeCompare(b.parentId ?? '') ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name)
  )
}

function hasDescendant(
  folders: ResourceFolder[],
  ancestorId: string,
  candidateId: string
): boolean {
  let currentId: string | null = candidateId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) return true
    visited.add(currentId)
    currentId = folders.find((folder) => folder.id === currentId)?.parentId ?? null
  }
  return false
}

export const useFoldersStore = create<FoldersStore>()((set, get) => ({
  folders: [],
  initialized: false,

  init: async () => {
    if (!initPromise) {
      initPromise = (async () => {
        set({ folders: sortFolders(await loadResourceFolders()), initialized: true })
      })().catch((error: unknown) => {
        initPromise = null
        throw error
      })
    }
    return initPromise
  },

  refresh: async () => {
    set({ folders: sortFolders(await loadResourceFolders()), initialized: true })
  },

  create: async ({ name, kind, parentId = null, defaultLanguage }) => {
    if (kind !== 'snippets' && defaultLanguage) {
      throw new Error('Default languages are only available for snippet folders')
    }
    const parent = parentId ? get().folders.find((folder) => folder.id === parentId) : undefined
    if (parentId && (!parent || parent.kind !== kind)) {
      throw new Error('A folder can only be nested under a folder of the same resource kind')
    }
    const siblings = get().folders.filter(
      (folder) => folder.kind === kind && folder.parentId === parentId
    )
    const now = Date.now()
    const folder: ResourceFolder = {
      id: nanoid(),
      name,
      parentId,
      kind,
      sortOrder: Math.max(0, ...siblings.map((sibling) => sibling.sortOrder)) + SORT_STEP,
      createdAt: now,
      updatedAt: now,
    }
    if (defaultLanguage) folder.defaultLanguage = defaultLanguage
    await saveResourceFolder(folder)
    set((state) => ({ folders: sortFolders([...state.folders, folder]) }))
    return folder
  },

  update: async (id, patch) => {
    const existing = get().folders.find((folder) => folder.id === id)
    if (!existing) return
    if (isInboxFolder(id) && patch.name && patch.name !== existing.name) {
      throw new Error('Inbox folders cannot be renamed')
    }
    if (existing.kind !== 'snippets' && patch.defaultLanguage !== undefined) {
      throw new Error('Default languages are only available for snippet folders')
    }
    const updated: ResourceFolder = { ...existing, ...patch, updatedAt: Date.now() }
    await saveResourceFolder(updated)
    set((state) => ({
      folders: sortFolders(state.folders.map((folder) => (folder.id === id ? updated : folder))),
    }))
  },

  rename: async (id, name) => get().update(id, { name }),

  move: async (id, parentId, index) => {
    const existing = get().folders.find((folder) => folder.id === id)
    if (isInboxFolder(id)) return
    if (!existing || (existing.parentId === parentId && index === undefined)) return
    const parent = parentId ? get().folders.find((folder) => folder.id === parentId) : undefined
    if (parentId && (!parent || parent.kind !== existing.kind)) {
      throw new Error('A folder can only be nested under a folder of the same resource kind')
    }
    if (parentId && hasDescendant(get().folders, id, parentId)) {
      throw new Error('A folder cannot be moved into its own subtree')
    }
    const siblings = sortFolders(
      get().folders.filter(
        (folder) =>
          folder.id !== id && folder.kind === existing.kind && folder.parentId === parentId
      )
    )
    let insertAt =
      index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length))
    if (parentId === null && siblings.some((folder) => isInboxFolder(folder.id))) {
      insertAt = Math.max(1, insertAt)
    }
    siblings.splice(insertAt, 0, existing)
    const ordered = siblings.map((folder, siblingIndex) => ({
      ...folder,
      sortOrder: (siblingIndex + 1) * SORT_STEP,
    }))
    const updated: ResourceFolder = {
      ...(ordered.find((folder) => folder.id === id) ?? existing),
      parentId,
      updatedAt: Date.now(),
    }
    await saveResourceFolderMove(updated, ordered)
    const byId = new Map(ordered.map((folder) => [folder.id, folder]))
    byId.set(id, updated)
    set((state) => ({
      folders: sortFolders(state.folders.map((folder) => byId.get(folder.id) ?? folder)),
    }))
  },

  reorder: async (sourceId, targetId, position) => {
    if (sourceId === targetId) return
    const source = get().folders.find((folder) => folder.id === sourceId)
    const target = get().folders.find((folder) => folder.id === targetId)
    if (!source || !target || source.kind !== target.kind || source.parentId !== target.parentId)
      return
    if (isInboxFolder(source.id) || (isInboxFolder(target.id) && position === 'before')) return
    const siblings = sortFolders(
      get().folders.filter(
        (folder) =>
          folder.id !== sourceId &&
          folder.kind === source.kind &&
          folder.parentId === source.parentId
      )
    )
    const targetIndex = siblings.findIndex((folder) => folder.id === targetId)
    if (targetIndex < 0) return
    siblings.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, source)
    const changed = siblings.map((folder, index) => ({
      ...folder,
      sortOrder: (index + 1) * SORT_STEP,
    }))
    await saveResourceFolderOrder(changed, source.kind)
    const byId = new Map(changed.map((folder) => [folder.id, folder]))
    set((state) => ({
      folders: sortFolders(state.folders.map((folder) => byId.get(folder.id) ?? folder)),
    }))
  },
}))
