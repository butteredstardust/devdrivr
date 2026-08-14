import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeNativeWindow,
  focusNativeWindow,
  isNativeWindowMaximized,
  minimizeNativeWindow,
  startNativeWindowResize,
  toggleNativeWindowMaximize,
} from '@/lib/native-window'

const invoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

beforeEach(() => {
  vi.clearAllMocks()
  invoke.mockResolvedValue(undefined)
})

describe('native window command bridge', () => {
  it('uses dedicated commands instead of the Tauri window plugin', async () => {
    await focusNativeWindow()
    await isNativeWindowMaximized()
    await minimizeNativeWindow()
    await toggleNativeWindowMaximize()
    await closeNativeWindow()

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      'window_focus',
      'window_is_maximized',
      'window_minimize',
      'window_toggle_maximize',
      'window_close',
    ])
  })

  it('passes resize direction to the native resize command', async () => {
    await startNativeWindowResize('SouthEast')

    expect(invoke).toHaveBeenCalledWith('window_start_resize', { direction: 'SouthEast' })
  })
})
