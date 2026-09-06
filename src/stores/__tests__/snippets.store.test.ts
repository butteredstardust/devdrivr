import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  clearAllSnippets,
  deleteSnippet,
  loadSnippets,
  loadTrashedSnippets,
  permanentlyDeleteSnippet,
  restoreSnippet,
  saveSnippet,
} from '@/lib/db'
import type { Snippet } from '@/types/models'
import { expectInitRejectionRecovers } from './init-rejection-helper'

// This file did not exist before — it covers only the init-rejection-recovery path
// (see documentation/TODO.md "Cover init-rejection recovery for the other six
// stores"). Broader snippets.store coverage is out of scope for this pass.
vi.mock('@/lib/db', () => ({
  loadSnippets: vi.fn(),
  loadTrashedSnippets: vi.fn().mockResolvedValue([]),
  saveSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  restoreSnippet: vi.fn(),
  permanentlyDeleteSnippet: vi.fn(),
  clearAllSnippets: vi.fn(),
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: vi.fn(() => ({ addToast: vi.fn() })) },
}))

describe('snippets store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.mocked(loadSnippets).mockResolvedValue([])
    vi.mocked(loadTrashedSnippets).mockResolvedValue([])
    vi.mocked(saveSnippet).mockResolvedValue(undefined)
    vi.mocked(deleteSnippet).mockResolvedValue(undefined)
    vi.mocked(restoreSnippet).mockResolvedValue(undefined)
    vi.mocked(permanentlyDeleteSnippet).mockResolvedValue(undefined)
    vi.mocked(clearAllSnippets).mockResolvedValue(undefined)
  })

  it('init() clears the cached promise on rejection so a later call retries', async () => {
    const { useSnippetsStore } = await import('../snippets.store')

    await expectInitRejectionRecovers({
      runInit: () => useSnippetsStore.getState().init(),
      arrangeFailure: () => {
        ;(loadSnippets as any).mockRejectedValueOnce(new Error('db locked'))
      },
      arrangeSuccess: () => {
        ;(loadSnippets as any).mockResolvedValueOnce([])
      },
      rejectMessage: 'db locked',
      assertAfterFailure: () => {
        expect(useSnippetsStore.getState().initialized).toBe(false)
      },
      assertAfterSuccess: () => {
        expect(useSnippetsStore.getState().initialized).toBe(true)
      },
      getCallCount: () => (loadSnippets as any).mock.calls.length,
    })
  })

  it('init() is idempotent — calling it twice only calls loadSnippets once', async () => {
    const { useSnippetsStore } = await import('../snippets.store')
    ;(loadSnippets as any).mockResolvedValue([])

    const p1 = useSnippetsStore.getState().init()
    const p2 = useSnippetsStore.getState().init()
    await Promise.all([p1, p2])

    expect(loadSnippets).toHaveBeenCalledOnce()
  })

  it('flushes the latest edit before moving a snippet to durable Trash', async () => {
    const { useSnippetsStore } = await import('../snippets.store')
    const snippet: Snippet = {
      id: 'snippet-1',
      title: 'Draft',
      content: 'before',
      language: 'text',
      tags: [],
      folder: '',
      folderId: 'snippets-inbox',
      createdAt: 1,
      updatedAt: 1,
    }
    useSnippetsStore.setState({ snippets: [snippet], trashedSnippets: [] })
    vi.mocked(loadTrashedSnippets).mockResolvedValue([
      { ...snippet, content: 'after', deletedAt: 2 },
    ])

    await useSnippetsStore.getState().update(snippet.id, { content: 'after' })
    await useSnippetsStore.getState().remove(snippet.id)

    expect(saveSnippet).toHaveBeenCalledWith(expect.objectContaining({ content: 'after' }))
    expect(vi.mocked(saveSnippet).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteSnippet).mock.invocationCallOrder[0]!
    )
    expect(useSnippetsStore.getState().trashedSnippets[0]?.content).toBe('after')
  })

  it('flushes pending edits before moving the library to durable Trash', async () => {
    const { useSnippetsStore } = await import('../snippets.store')
    const snippet: Snippet = {
      id: 'snippet-1',
      title: 'Draft',
      content: 'before',
      language: 'text',
      tags: [],
      folder: '',
      folderId: 'snippets-inbox',
      createdAt: 1,
      updatedAt: 1,
    }
    useSnippetsStore.setState({ snippets: [snippet], trashedSnippets: [] })
    vi.mocked(loadTrashedSnippets).mockResolvedValue([
      { ...snippet, content: 'after', deletedAt: 2 },
    ])

    await useSnippetsStore.getState().update(snippet.id, { content: 'after' })
    await useSnippetsStore.getState().clearAll()

    expect(saveSnippet).toHaveBeenCalledWith(expect.objectContaining({ content: 'after' }))
    expect(vi.mocked(saveSnippet).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(clearAllSnippets).mock.invocationCallOrder[0]!
    )
    expect(useSnippetsStore.getState().trashedSnippets[0]?.content).toBe('after')
  })
})
