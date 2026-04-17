import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}))

describe('useMcpStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getSetting.mockReset()
    mocks.setSetting.mockReset()
    mocks.invoke.mockReset()
    mocks.setSetting.mockResolvedValue(undefined)
    mocks.invoke.mockResolvedValue({
      running: true,
      host: '127.0.0.1',
      port: 17347,
      url: 'http://127.0.0.1:17347/mcp',
      lastError: null,
    })
  })

  it('generates default settings and starts the server on init', async () => {
    mocks.getSetting.mockResolvedValue(null)
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()

    const state = useMcpStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.settings.enabled).toBe(true)
    expect(state.settings.permissions.notes.read).toBe(true)
    expect(state.settings.permissions.notes.create).toBe(false)
    expect(state.settings.apiKey).not.toEqual('')
    expect(mocks.setSetting).toHaveBeenCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenCalledWith('mcp_start', { settings: state.settings })
  })

  it('persists permission changes and applies them to the running server', async () => {
    mocks.getSetting.mockResolvedValue(null)
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    await useMcpStore.getState().updatePermission('snippets', 'create', true)

    const state = useMcpStore.getState()
    expect(state.settings.permissions.snippets.create).toBe(true)
    expect(mocks.setSetting).toHaveBeenLastCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_apply_settings', {
      settings: state.settings,
    })
  })
})
