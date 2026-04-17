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

  it('stops the server and persists disabled autostart', async () => {
    mocks.getSetting.mockResolvedValue(null)
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    await useMcpStore.getState().stop()

    const state = useMcpStore.getState()
    expect(state.settings.enabled).toBe(false)
    expect(state.pending).toBe(false)
    expect(mocks.setSetting).toHaveBeenLastCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_stop', { settings: state.settings })
  })

  it('restarts the server and keeps autostart enabled', async () => {
    mocks.getSetting.mockResolvedValue({ enabled: false })
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    await useMcpStore.getState().restart()

    const state = useMcpStore.getState()
    expect(state.settings.enabled).toBe(true)
    expect(state.pending).toBe(false)
    expect(mocks.setSetting).toHaveBeenLastCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_restart', { settings: state.settings })
  })

  it('rotates the API key and applies settings', async () => {
    mocks.getSetting.mockResolvedValue({ apiKey: 'old-key' })
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    await useMcpStore.getState().rotateKey()

    const state = useMcpStore.getState()
    expect(state.settings.apiKey).not.toBe('old-key')
    expect(state.settings.apiKey).not.toBe('')
    expect(mocks.setSetting).toHaveBeenLastCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_apply_settings', {
      settings: state.settings,
    })
  })

  it('clears pending and rejects when start fails', async () => {
    mocks.getSetting.mockResolvedValue(null)
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    mocks.invoke.mockRejectedValueOnce(new Error('port unavailable'))

    await expect(useMcpStore.getState().start()).rejects.toThrow('port unavailable')
    expect(useMcpStore.getState().pending).toBe(false)
  })
})
