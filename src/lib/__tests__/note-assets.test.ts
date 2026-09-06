import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectNoteAssetIds,
  createNotesBackup,
  importNoteImage,
  resolveNoteAssetMarkdown,
  restoreNotesBackup,
} from '@/lib/note-assets'
import type { Note, ResourceFolder } from '@/types/models'

const core = vi.hoisted(() => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost${path}`),
}))

vi.mock('@tauri-apps/api/core', () => core)

const ID = '550e8400-e29b-41d4-a716-446655440000'

const parentFolder: ResourceFolder = {
  id: 'notes-project',
  name: 'Project',
  parentId: null,
  kind: 'notes',
  sortOrder: 1_000,
  createdAt: 1,
  updatedAt: 2,
}

const childFolder: ResourceFolder = {
  ...parentFolder,
  id: 'notes-project-design',
  name: 'Design',
  parentId: parentFolder.id,
  sortOrder: 2_000,
}

function note(content: string): Note {
  return {
    id: 'note-1',
    title: 'Reference',
    content,
    color: 'orange',
    pinned: true,
    poppedOut: false,
    createdAt: 1,
    updatedAt: 2,
    tags: ['docs'],
    sortOrder: 0,
    folderId: 'notes-inbox',
  }
}

describe('managed note assets', () => {
  beforeEach(() => {
    core.invoke.mockReset()
    core.convertFileSrc.mockClear()
  })

  it('collects unique portable references in stable order', () => {
    expect(
      collectNoteAssetIds([
        `![one](devdrivr-asset:${ID})`,
        `again devdrivr-asset:${ID}`,
        'devdrivr-asset:00000000-0000-0000-0000-000000000001',
      ])
    ).toEqual(['00000000-0000-0000-0000-000000000001', ID])
  })

  it('keeps Unicode display names while Rust supplies a collision-safe ID', async () => {
    core.invoke.mockResolvedValue({
      id: ID,
      fileName: `${ID}.png`,
      mimeType: 'image/png',
      size: 8,
      path: `/data/note-assets/${ID}.png`,
    })
    const markdown = await importNoteImage(new Uint8Array([1, 2]), 'diagramă 日本語.png')
    expect(markdown).toBe(`![diagramă 日本語](devdrivr-asset:${ID})`)
    expect(core.invoke).toHaveBeenCalledWith('note_asset_import', { bytes: [1, 2] })
  })

  it('gives duplicate display names independent portable references', async () => {
    const secondId = '00000000-0000-0000-0000-000000000001'
    core.invoke.mockResolvedValueOnce({ id: ID }).mockResolvedValueOnce({ id: secondId })
    const first = await importNoteImage(new Uint8Array([1]), 'diagram.png')
    const second = await importNoteImage(new Uint8Array([2]), 'diagram.png')
    expect(first).toBe(`![diagram](devdrivr-asset:${ID})`)
    expect(second).toBe(`![diagram](devdrivr-asset:${secondId})`)
  })

  it('resolves managed references and renders missing files explicitly', async () => {
    core.invoke.mockResolvedValueOnce({
      id: ID,
      fileName: `${ID}.png`,
      mimeType: 'image/png',
      size: 8,
      path: `/data/note-assets/${ID}.png`,
    })
    await expect(resolveNoteAssetMarkdown(`![diagram](devdrivr-asset:${ID})`)).resolves.toBe(
      `![diagram](asset://localhost/data/note-assets/${ID}.png)`
    )
    core.invoke.mockRejectedValueOnce(new Error('missing'))
    await expect(resolveNoteAssetMarkdown(`![diagram](devdrivr-asset:${ID})`)).resolves.toBe(
      '**[Missing image: diagram]**'
    )
  })

  it('exports referenced assets once and restores them before returning notes', async () => {
    const asset = {
      id: ID,
      fileName: `${ID}.png`,
      mimeType: 'image/png',
      bytes: [137, 80, 78, 71],
    }
    core.invoke.mockResolvedValueOnce([asset])
    const json = await createNotesBackup(
      [note(`![first](devdrivr-asset:${ID})\n![second](devdrivr-asset:${ID})`)],
      []
    )
    expect(core.invoke).toHaveBeenCalledWith('note_assets_export', { ids: [ID] })
    const backup = JSON.parse(json) as { notes: unknown[]; assets: unknown[] }
    expect(backup.notes).toHaveLength(1)
    expect(backup.assets).toEqual([asset])

    core.invoke.mockResolvedValueOnce(1)
    const restored = await restoreNotesBackup(json)
    expect(core.invoke).toHaveBeenLastCalledWith('note_assets_restore', { assets: [asset] })
    expect(restored.version).toBe(2)
    expect(restored.notes[0]).toMatchObject({
      id: 'note-1',
      title: 'Reference',
      color: 'orange',
      pinned: true,
    })
  })

  it('round-trips nested folders, stable note IDs, and wiki-link targets', async () => {
    const target = { ...note('Target'), id: 'note-target', folderId: childFolder.id }
    const source = {
      ...note('[[note:note-target|Target]]'),
      id: 'note-source',
      folderId: childFolder.id,
    }
    core.invoke.mockResolvedValueOnce([])
    const json = await createNotesBackup([source, target], [childFolder, parentFolder])

    core.invoke.mockResolvedValueOnce(0)
    const restored = await restoreNotesBackup(json)

    expect(restored.version).toBe(2)
    expect(restored.folders.map((folder) => folder.id)).toEqual([parentFolder.id, childFolder.id])
    expect(restored.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'note-source',
          folderId: childFolder.id,
          content: '[[note:note-target|Target]]',
        }),
        expect.objectContaining({ id: 'note-target', folderId: childFolder.id }),
      ])
    )
  })

  it('rejects malformed backup notes before writing assets', async () => {
    await expect(
      restoreNotesBackup(
        JSON.stringify({
          format: 'devdrivr-notes',
          version: 1,
          notes: [{ title: 'bad' }],
          assets: [],
        })
      )
    ).rejects.toThrow('invalid note')
    expect(core.invoke).not.toHaveBeenCalled()
  })
})
