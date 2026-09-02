import { describe, expect, it, beforeEach, vi } from 'vitest'
import { loadUserPromptTemplates, seedBuiltinPromptTemplates } from '@/lib/db'
import { expectInitRejectionRecovers } from './init-rejection-helper'

// This file did not exist before — it covers only the init-rejection-recovery path
// (see documentation/TODO.md "Cover init-rejection recovery for the other six
// stores"). Broader prompt-templates.store coverage is out of scope for this pass.
vi.mock('@/lib/db', () => ({
  deleteUserPromptTemplate: vi.fn(),
  loadUserPromptTemplates: vi.fn(),
  saveUserPromptTemplate: vi.fn(),
  saveUserPromptTemplates: vi.fn(),
  seedBuiltinPromptTemplates: vi.fn(),
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: vi.fn(() => ({ addToast: vi.fn() })) },
}))

describe('prompt-templates store initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    ;(seedBuiltinPromptTemplates as any).mockResolvedValue(undefined)
  })

  it('init() clears the cached promise on rejection so a later call retries', async () => {
    const { usePromptTemplatesStore } = await import('../prompt-templates.store')

    await expectInitRejectionRecovers({
      runInit: () => usePromptTemplatesStore.getState().init(),
      arrangeFailure: () => {
        ;(loadUserPromptTemplates as any).mockRejectedValueOnce(new Error('db locked'))
      },
      arrangeSuccess: () => {
        ;(loadUserPromptTemplates as any).mockResolvedValueOnce([])
      },
      rejectMessage: 'db locked',
      assertAfterFailure: () => {
        expect(usePromptTemplatesStore.getState().initialized).toBe(false)
      },
      assertAfterSuccess: () => {
        expect(usePromptTemplatesStore.getState().initialized).toBe(true)
      },
      getCallCount: () => (loadUserPromptTemplates as any).mock.calls.length,
    })
  })

  it('init() is idempotent — calling it twice only calls loadUserPromptTemplates once', async () => {
    const { usePromptTemplatesStore } = await import('../prompt-templates.store')
    ;(loadUserPromptTemplates as any).mockResolvedValue([])

    const p1 = usePromptTemplatesStore.getState().init()
    const p2 = usePromptTemplatesStore.getState().init()
    await Promise.all([p1, p2])

    expect(loadUserPromptTemplates).toHaveBeenCalledOnce()
    expect(seedBuiltinPromptTemplates).toHaveBeenCalledOnce()
  })
})
