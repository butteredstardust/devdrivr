import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadResourceFolders,
  saveResourceFolder,
  saveResourceFolderMove,
  saveResourceFolderOrder,
} from '@/lib/db'
import type { ResourceFolder } from '@/types/models'
import { expectInitRejectionRecovers } from './init-rejection-helper'

vi.mock('@/lib/db', () => ({
  loadResourceFolders: vi.fn(),
  saveResourceFolder: vi.fn(),
  saveResourceFolderMove: vi.fn(),
  saveResourceFolderOrder: vi.fn(),
}))

const parent: ResourceFolder = {
  id: 'parent',
  name: 'Parent',
  parentId: null,
  kind: 'snippets',
  sortOrder: 1_000,
  createdAt: 1,
  updatedAt: 1,
}

describe('folders store', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.mocked(loadResourceFolders).mockResolvedValue([])
    vi.mocked(saveResourceFolder).mockResolvedValue()
    vi.mocked(saveResourceFolderMove).mockResolvedValue()
    vi.mocked(saveResourceFolderOrder).mockResolvedValue()
  })

  it('initializes only once and recovers from a failed initialization', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    await expectInitRejectionRecovers({
      runInit: () => useFoldersStore.getState().init(),
      arrangeFailure: () =>
        vi.mocked(loadResourceFolders).mockRejectedValueOnce(new Error('locked')),
      arrangeSuccess: () => vi.mocked(loadResourceFolders).mockResolvedValueOnce([parent]),
      rejectMessage: 'locked',
      assertAfterFailure: () => expect(useFoldersStore.getState().initialized).toBe(false),
      assertAfterSuccess: () => expect(useFoldersStore.getState().folders).toEqual([parent]),
      getCallCount: () => vi.mocked(loadResourceFolders).mock.calls.length,
    })
  })

  it('shares one in-flight initialization', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    vi.mocked(loadResourceFolders).mockResolvedValue([parent])

    await Promise.all([useFoldersStore.getState().init(), useFoldersStore.getState().init()])

    expect(loadResourceFolders).toHaveBeenCalledOnce()
    expect(useFoldersStore.getState().folders).toEqual([parent])
  })

  it('creates, renames, moves, and reorders typed folders without a delete action', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    useFoldersStore.setState({ folders: [parent], initialized: true })

    const child = await useFoldersStore.getState().create({
      name: 'Web',
      kind: 'snippets',
      parentId: parent.id,
      defaultLanguage: 'typescript',
    })
    await useFoldersStore.getState().rename(child.id, 'Frontend')
    await useFoldersStore.getState().move(child.id, null, 0)
    await useFoldersStore.getState().reorder(child.id, parent.id, 'before')

    expect(saveResourceFolder).toHaveBeenCalledWith(
      expect.objectContaining({ id: child.id, name: 'Web', parentId: parent.id })
    )
    expect(saveResourceFolderMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: child.id, name: 'Frontend', parentId: null }),
      expect.any(Array)
    )
    expect(saveResourceFolderOrder).toHaveBeenCalled()
    expect(useFoldersStore.getState()).not.toHaveProperty('remove')
  })

  it('rejects moving a folder into its own subtree', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    const child: ResourceFolder = { ...parent, id: 'child', parentId: parent.id }
    useFoldersStore.setState({ folders: [parent, child], initialized: true })

    await expect(useFoldersStore.getState().move(parent.id, child.id)).rejects.toThrow(
      'own subtree'
    )
  })

  it('uses move indexes to persist sibling keyboard movement', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    const second: ResourceFolder = { ...parent, id: 'second', name: 'Second', sortOrder: 2_000 }
    useFoldersStore.setState({ folders: [parent, second], initialized: true })

    await useFoldersStore.getState().move(second.id, null, 0)

    expect(useFoldersStore.getState().folders.map((folder) => folder.id)).toEqual([
      second.id,
      parent.id,
    ])
    expect(saveResourceFolderMove).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: second.id, parentId: null, sortOrder: 1_000 }),
      [
        expect.objectContaining({ id: second.id, sortOrder: 1_000 }),
        expect.objectContaining({ id: parent.id, sortOrder: 2_000 }),
      ]
    )
  })

  it('keeps system Inboxes stable and limits default languages to snippets', async () => {
    const { useFoldersStore } = await import('@/stores/folders.store')
    const inbox: ResourceFolder = { ...parent, id: 'notes-inbox', name: 'Inbox', kind: 'notes' }
    useFoldersStore.setState({ folders: [inbox], initialized: true })

    await expect(useFoldersStore.getState().rename(inbox.id, 'Renamed')).rejects.toThrow(
      'cannot be renamed'
    )
    await useFoldersStore.getState().move(inbox.id, null, 1)
    await expect(
      useFoldersStore.getState().create({
        name: 'Invalid',
        kind: 'notes',
        defaultLanguage: 'typescript',
      })
    ).rejects.toThrow('snippet folders')
    expect(saveResourceFolderMove).not.toHaveBeenCalled()
  })
})
