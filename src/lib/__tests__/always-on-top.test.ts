import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAlwaysOnTop } from '@/lib/always-on-top'

const mocks = vi.hoisted(() => ({
  nativeSet: vi.fn(),
  update: vi.fn(),
  state: { alwaysOnTop: false },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setAlwaysOnTop: mocks.nativeSet }),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({ ...mocks.state, update: mocks.update }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.alwaysOnTop = false
  mocks.nativeSet.mockResolvedValue(undefined)
  mocks.update.mockResolvedValue(true)
})

describe('setAlwaysOnTop', () => {
  it('updates the native window and persisted setting together', async () => {
    await expect(setAlwaysOnTop(true)).resolves.toBeUndefined()
    expect(mocks.nativeSet).toHaveBeenCalledWith(true)
    expect(mocks.update).toHaveBeenCalledWith('alwaysOnTop', true)
  })

  it('leaves persistence unchanged when the native call fails', async () => {
    mocks.nativeSet.mockRejectedValueOnce(new Error('blocked'))
    await expect(setAlwaysOnTop(true)).rejects.toThrow('blocked')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rolls the native window back when persistence fails', async () => {
    mocks.update.mockResolvedValueOnce(false)
    await expect(setAlwaysOnTop(true)).rejects.toThrow('Failed to save window pin state')
    expect(mocks.nativeSet).toHaveBeenNthCalledWith(1, true)
    expect(mocks.nativeSet).toHaveBeenNthCalledWith(2, false)
  })
})
