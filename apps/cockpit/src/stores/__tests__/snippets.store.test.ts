import { describe, expect, it, beforeEach, vi } from 'vitest'
import { loadSnippets } from '@/lib/db'
import { expectInitRejectionRecovers } from './init-rejection-helper'

// This file did not exist before — it covers only the init-rejection-recovery path
// (see documentation/TODO.md "Cover init-rejection recovery for the other six
// stores"). Broader snippets.store coverage is out of scope for this pass.
vi.mock('@/lib/db', () => ({
  loadSnippets: vi.fn(),
  saveSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
  clearAllSnippets: vi.fn(),
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: vi.fn(() => ({ addToast: vi.fn() })) },
}))

describe('snippets store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
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
})
