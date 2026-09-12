import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiBackup } from '@/hooks/useApiBackup'
import { useNotesBackup, type BackupReporter } from '@/hooks/useNotesBackup'
import { usePromptTemplatesBackup } from '@/hooks/usePromptTemplatesBackup'
import { useSnippetsBackup } from '@/hooks/useSnippetsBackup'
import { exportFile, openFileDialog } from '@/lib/file-io'
import { useApiStore } from '@/stores/api.store'
import { useFoldersStore } from '@/stores/folders.store'
import { useNotesStore } from '@/stores/notes.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useSnippetsStore } from '@/stores/snippets.store'

vi.mock('@/lib/file-io', () => ({
  buildExportFilename: (base: string, extension: string) => `${base}.${extension}`,
  exportFile: vi.fn(),
  openFileDialog: vi.fn(),
}))

vi.mock('@/lib/note-assets', () => ({
  createNotesBackup: vi.fn().mockResolvedValue('{"version":2}'),
  restoreNotesBackup: vi.fn(),
  rollbackRestoredNoteAssets: vi.fn(),
  finalizeRestoredNoteAssets: vi.fn(),
}))

type BackupHook = (report: BackupReporter) => {
  exportBackup: () => Promise<void>
  importBackup: () => Promise<unknown>
}

const backupHooks: Array<[string, BackupHook, string]> = [
  ['notes', useNotesBackup, 'devdrivr-notes-backup.json'],
  ['snippets', useSnippetsBackup, 'devdrivr-snippets-backup.json'],
  ['API requests', useApiBackup, 'devdrivr-api-requests-backup.json'],
  ['prompt templates', usePromptTemplatesBackup, 'devdrivr-prompt-templates-backup.json'],
]

describe('shared dataset backup hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportFile).mockResolvedValue('/tmp/backup.json')
    vi.mocked(openFileDialog).mockResolvedValue(null)
    useFoldersStore.setState({ folders: [] })
    useNotesStore.setState({ notes: [], flushPending: vi.fn().mockResolvedValue(undefined) })
    useSnippetsStore.setState({
      snippets: [],
      importBatch: vi.fn().mockResolvedValue(undefined),
    })
    useApiStore.setState({
      requests: [],
      collections: [],
      environments: [],
      activeEnvironmentId: null,
      importApiData: vi.fn().mockResolvedValue({
        requests: 0,
        collections: 0,
        environments: 0,
      }),
    })
    usePromptTemplatesStore.setState({
      userTemplates: [],
      importMany: vi.fn().mockResolvedValue([]),
    })
  })

  it.each(backupHooks)('uses the agreed %s export filename', async (_name, useBackup, filename) => {
    const report = vi.fn()
    const { result } = renderHook(() => useBackup(report))

    await act(async () => {
      await result.current.exportBackup()
    })

    expect(exportFile).toHaveBeenCalledWith(expect.anything(), filename)
  })

  it.each(backupHooks)(
    'does nothing when the %s import dialog is cancelled',
    async (_name, useBackup) => {
      const report = vi.fn()
      const { result } = renderHook(() => useBackup(report))

      await act(async () => {
        await result.current.importBackup()
      })

      expect(report).not.toHaveBeenCalled()
      expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
      expect(useApiStore.getState().importApiData).not.toHaveBeenCalled()
      expect(usePromptTemplatesStore.getState().importMany).not.toHaveBeenCalled()
    }
  )
})

describe('useSnippetsBackup validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFoldersStore.setState({ folders: [] })
    useSnippetsStore.setState({
      snippets: [],
      importBatch: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('rejects a file above the byte cap', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: 'x'.repeat(20 * 1024 * 1024 + 1),
      filename: 'snippets.json',
      path: '/tmp/snippets.json',
    })
    const report = vi.fn()
    const { result } = renderHook(() => useSnippetsBackup(report))

    await act(async () => {
      await result.current.importBackup()
    })

    expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(
      'Import failed — file is 20.0 MB, above the 20.0 MB limit',
      'error'
    )
  })

  it('rejects a backup above the snippet cap', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: JSON.stringify(Array.from({ length: 5001 }, () => ({ title: 'x', content: 'x' }))),
      filename: 'snippets.json',
      path: '/tmp/snippets.json',
    })
    const report = vi.fn()
    const { result } = renderHook(() => useSnippetsBackup(report))

    await act(async () => {
      await result.current.importBackup()
    })

    expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(
      'Import failed — 5001 snippets exceeds the 5000 snippet limit',
      'error'
    )
  })

  it('rejects an invalid folder hierarchy', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: JSON.stringify({
        version: 3,
        folders: [{ id: 'child', name: 'Child', parentId: 'missing' }],
        snippets: [{ title: 'x', content: 'x' }],
      }),
      filename: 'snippets.json',
      path: '/tmp/snippets.json',
    })
    const report = vi.fn()
    const { result } = renderHook(() => useSnippetsBackup(report))

    await act(async () => {
      await result.current.importBackup()
    })

    expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(
      'Import failed — choose a valid snippets JSON file',
      'error'
    )
  })

  it('rejects a backup above the folder cap', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: JSON.stringify({
        version: 3,
        folders: Array.from({ length: 5001 }, (_, index) => ({
          id: `folder-${index}`,
          name: `Folder ${index}`,
        })),
        snippets: [{ title: 'x', content: 'x' }],
      }),
      filename: 'snippets.json',
      path: '/tmp/snippets.json',
    })
    const report = vi.fn()
    const { result } = renderHook(() => useSnippetsBackup(report))

    await act(async () => {
      await result.current.importBackup()
    })

    expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(
      'Import failed — choose a valid snippets JSON file',
      'error'
    )
  })

  it.each([
    ['title', { title: 'x'.repeat(2001), content: 'x' }],
    ['body', { title: 'x', content: 'x'.repeat(500001) }],
    ['description', { title: 'x', content: 'x', description: 'x'.repeat(100001) }],
    ['fragment count', { title: 'x', content: 'x', fragments: Array(101).fill({ content: 'x' }) }],
    ['tag count', { title: 'x', content: 'x', tags: Array(51).fill('x') }],
    [
      'fragment name',
      { title: 'x', content: 'x', fragments: [{ name: 'x'.repeat(501), content: 'x' }] },
    ],
    [
      'fragment body',
      { title: 'x', content: 'x', fragments: [{ name: 'x', content: 'x'.repeat(500001) }] },
    ],
  ])('rejects a snippet above the %s cap', async (_name, snippet) => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: JSON.stringify([snippet]),
      filename: 'snippets.json',
      path: '/tmp/snippets.json',
    })
    const report = vi.fn()
    const { result } = renderHook(() => useSnippetsBackup(report))

    await act(async () => {
      await result.current.importBackup()
    })

    expect(useSnippetsStore.getState().importBatch).not.toHaveBeenCalled()
    expect(report).toHaveBeenCalledWith(
      'Import failed — choose a valid snippets JSON file',
      'error'
    )
  })
})
