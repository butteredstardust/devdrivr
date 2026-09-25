import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveToolState } from '@/lib/db'
import { forgetToolStateFailure, saveToolStateWithFeedback } from '@/lib/tool-state-persistence'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  saveToolState: vi.fn(),
}))

// Count reports, not visible toasts: the store shows a repeated message only once.
const addToast = vi.fn(useUiStore.getState().addToast)

describe('saveToolStateWithFeedback', () => {
  beforeEach(async () => {
    vi.mocked(saveToolState).mockResolvedValue(undefined)
    // End any outage an earlier test left open.
    for (const key of ['json-tools', 'yaml-tools']) await saveToolStateWithFeedback(key, {})
    vi.clearAllMocks()
    useUiStore.setState({ toasts: [], addToast })
  })

  it('toasts once per persistence outage', async () => {
    const error = new Error('database is locked')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveToolState).mockRejectedValue(error)

    await expect(saveToolStateWithFeedback('json-tools', { input: 'one' })).rejects.toBe(error)
    await expect(saveToolStateWithFeedback('yaml-tools', { input: 'two' })).rejects.toBe(error)

    expect(consoleError).toHaveBeenCalledTimes(2)
    expect(addToast).toHaveBeenCalledOnce()
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

    expect(addToast).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
  it('keeps the outage open while another key still fails', async () => {
    const error = new Error('database is locked')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveToolState)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)

    await expect(saveToolStateWithFeedback('json-tools', { input: 'one' })).rejects.toBe(error)
    await saveToolStateWithFeedback('yaml-tools', { input: 'saved' })
    await expect(saveToolStateWithFeedback('json-tools', { input: 'two' })).rejects.toBe(error)

    expect(addToast).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
  it('ends the outage when the failing key belongs to a closed tab', async () => {
    const error = new Error('database is locked')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveToolState).mockRejectedValue(error)

    await expect(saveToolStateWithFeedback('json-tools#tab-1', {})).rejects.toBe(error)
    forgetToolStateFailure('json-tools#tab-1')
    await expect(saveToolStateWithFeedback('json-tools', {})).rejects.toBe(error)

    expect(addToast).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
})
