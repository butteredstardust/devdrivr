import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  clearAllUserPromptTemplates,
  loadUserPromptTemplates,
  seedBuiltinPromptTemplates,
} from '@/lib/db'
import { expectInitRejectionRecovers } from './init-rejection-helper'

// Covers the init-rejection-recovery path only. Broader prompt-templates.store coverage lives
// elsewhere.
vi.mock('@/lib/db', () => ({
  clearAllUserPromptTemplates: vi.fn(),
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

  it('clearAll() empties the custom templates and settles the saving flag', async () => {
    const { usePromptTemplatesStore } = await import('../prompt-templates.store')
    ;(clearAllUserPromptTemplates as any).mockResolvedValue(undefined)
    usePromptTemplatesStore.setState({ userTemplates: [{ id: 't1' } as any] })

    await usePromptTemplatesStore.getState().clearAll()

    expect(clearAllUserPromptTemplates).toHaveBeenCalledOnce()
    expect(usePromptTemplatesStore.getState().userTemplates).toEqual([])
    expect(usePromptTemplatesStore.getState().saving).toBe(false)
  })

  it('clearAll() keeps the templates when the write fails', async () => {
    const { usePromptTemplatesStore } = await import('../prompt-templates.store')
    ;(clearAllUserPromptTemplates as any).mockRejectedValueOnce(new Error('db locked'))
    usePromptTemplatesStore.setState({ userTemplates: [{ id: 't1' } as any] })

    await expect(usePromptTemplatesStore.getState().clearAll()).rejects.toThrow('db locked')

    expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1)
    expect(usePromptTemplatesStore.getState().saving).toBe(false)
  })
})
