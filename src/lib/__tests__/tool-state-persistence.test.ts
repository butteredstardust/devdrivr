import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveToolState } from '@/lib/db'
import { saveToolStateWithFeedback } from '@/lib/tool-state-persistence'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  saveToolState: vi.fn(),
}))

describe('saveToolStateWithFeedback', () => {
  beforeEach(async () => {
    vi.mocked(saveToolState).mockResolvedValue(undefined)
    await saveToolStateWithFeedback('reset', {})
    vi.clearAllMocks()
    useUiStore.setState({ toasts: [] })
  })

  it('toasts once per persistence outage', async () => {
    const error = new Error('database is locked')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveToolState).mockRejectedValue(error)

    await expect(saveToolStateWithFeedback('json-tools', { input: 'one' })).rejects.toBe(error)
    await expect(saveToolStateWithFeedback('yaml-tools', { input: 'two' })).rejects.toBe(error)

    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(useUiStore.getState().toasts).toEqual([
      expect.objectContaining({
        message: 'Failed to save tool state: database is locked. Recent changes may be lost.',
        type: 'error',
      }),
    ])
    consoleError.mockRestore()
  })

  it('reports a new outage after a successful write', async () => {
    const error = new Error('disk is full')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveToolState).mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)

    await expect(saveToolStateWithFeedback('json-tools', { input: 'one' })).rejects.toBe(error)
    await saveToolStateWithFeedback('json-tools', { input: 'saved' })
    vi.mocked(saveToolState).mockRejectedValueOnce(error)
    await expect(saveToolStateWithFeedback('json-tools', { input: 'two' })).rejects.toBe(error)

    expect(useUiStore.getState().toasts).toHaveLength(2)
    consoleError.mockRestore()
  })
})
