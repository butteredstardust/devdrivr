import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  invoke: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getSetting: mocks.getSetting,
  setSetting: mocks.setSetting,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: {
    getState: () => ({ addToast: mocks.addToast }),
  },
}))

describe('useMcpStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getSetting.mockReset()
    mocks.setSetting.mockReset()
    mocks.invoke.mockReset()
    mocks.addToast.mockReset()
    mocks.setSetting.mockResolvedValue(undefined)
    mocks.invoke.mockResolvedValue({
      running: true,
      host: '127.0.0.1',
      port: 17347,
      url: 'http://127.0.0.1:17347/mcp',
      lastError: null,
    })
  })

  it('generates disabled default settings and checks server status on init', async () => {
    mocks.getSetting.mockResolvedValue(null)
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()

    const state = useMcpStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.settings.enabled).toBe(false)
    for (const permissions of Object.values(state.settings.permissions)) {
      expect(permissions).toEqual({
        read: true,
        create: false,
        update: false,
        delete: false,
      })
    }
    expect(state.settings.apiRequestsExposeSecrets).toBe(false)
    expect(state.settings.host).toBe('127.0.0.1')
    expect(state.settings.apiKey).not.toEqual('')
    expect(mocks.setSetting).toHaveBeenCalledWith('mcpSettings', state.settings)
    expect(mocks.invoke).toHaveBeenCalledWith('mcp_status', { settings: state.settings })
    expect(mocks.invoke).not.toHaveBeenCalledWith('mcp_start', expect.anything())
  })

  it('starts only when persisted settings explicitly enable autostart', async () => {
    mocks.getSetting.mockResolvedValue({ enabled: true, apiKey: 'saved-key' })
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()

    expect(mocks.invoke).toHaveBeenCalledWith('mcp_start', {
      settings: expect.objectContaining({ enabled: true, apiKey: 'saved-key' }),
    })
  })

  it('keeps initialization non-blocking and surfaces native status failures', async () => {
    mocks.getSetting.mockResolvedValue(null)
    mocks.invoke.mockRejectedValueOnce(new Error('native status unavailable'))
    const { useMcpStore } = await import('@/stores/mcp.store')

    await expect(useMcpStore.getState().init()).resolves.toBeUndefined()

    expect(useMcpStore.getState()).toMatchObject({
      initialized: true,
      status: {
        running: false,
        lastError: 'native status unavailable',
      },
    })
    expect(mocks.addToast).toHaveBeenCalledWith(
      'Failed to initialize MCP server: native status unavailable',
      'error'
    )
  })

  it('does not block app initialization when MCP settings persistence fails', async () => {
    mocks.getSetting.mockResolvedValue(null)
    mocks.setSetting.mockRejectedValueOnce(new Error('settings database unavailable'))
    const { useMcpStore } = await import('@/stores/mcp.store')

    await expect(useMcpStore.getState().init()).resolves.toBeUndefined()

    expect(useMcpStore.getState()).toMatchObject({
      initialized: true,
      settings: { enabled: false, host: '127.0.0.1' },
      status: {
        running: false,
        lastError: 'settings database unavailable',
      },
    })
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.addToast).toHaveBeenCalledWith(
      'Failed to initialize MCP server: settings database unavailable',
      'error'
    )
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
    expect(state.settings.apiKey).toHaveLength(43)
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
    expect(useMcpStore.getState().settings.enabled).toBe(false)
    expect(useMcpStore.getState().status.lastError).toBe('port unavailable')
    expect(mocks.setSetting).toHaveBeenLastCalledWith(
      'mcpSettings',
      expect.objectContaining({ enabled: false })
    )
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_apply_settings', {
      settings: expect.objectContaining({ enabled: false }),
    })
  })

  it('reapplies the previous settings after a rejected native change', async () => {
    mocks.getSetting.mockResolvedValue({ enabled: true, port: 17347, apiKey: 'saved-key' })
    const { useMcpStore } = await import('@/stores/mcp.store')

    await useMcpStore.getState().init()
    mocks.invoke.mockRejectedValueOnce(new Error('new port unavailable'))

    await expect(useMcpStore.getState().updateSettings({ port: 18000 })).rejects.toThrow(
      'new port unavailable'
    )

    expect(useMcpStore.getState()).toMatchObject({
      pending: false,
      settings: { enabled: true, port: 17347, apiKey: 'saved-key' },
      status: {
        url: 'http://127.0.0.1:17347/mcp',
        lastError: 'new port unavailable',
      },
    })
    expect(mocks.setSetting).toHaveBeenLastCalledWith(
      'mcpSettings',
      expect.objectContaining({ port: 17347 })
    )
    expect(mocks.invoke).toHaveBeenLastCalledWith('mcp_apply_settings', {
      settings: expect.objectContaining({ enabled: true, port: 17347 }),
    })
  })

  // Unlike the other six stores with this pattern, mcp.store's init() must never
  // reject: it is the only store awaited directly in providers.tsx's bootstrap
  // sequence, and MCP is an optional, disabled-by-default feature — a rejection
  // there would turn a degraded MCP server into a full app-startup failure. So
  // init()'s internal try/catch swallows failures, sets `initialized: true` (so
  // the UI shows a degraded MCP rather than a permanent spinner), and resolves
  // successfully. The bug this test guards against: that inner catch used to
  // never clear the cached `initPromise`, so a later init() call returned the
  // same already-resolved promise instead of genuinely retrying. We prove the
  // fix by calling init() twice and asserting getSetting was invoked both times.
  it('init() clears the cached promise on failure so a later call retries', async () => {
    const { useMcpStore: freshStore } = await import('@/stores/mcp.store')

    mocks.getSetting.mockRejectedValueOnce(new Error('db locked'))
    await expect(freshStore.getState().init()).resolves.toBeUndefined()

    const failedState = freshStore.getState()
    expect(failedState.initialized).toBe(true)
    expect(failedState.status.lastError).toBe('db locked')
    expect(mocks.addToast).toHaveBeenCalledWith(
      'Failed to initialize MCP server: db locked',
      'error'
    )
    expect(mocks.getSetting).toHaveBeenCalledTimes(1)

    mocks.getSetting.mockResolvedValueOnce(null)
    await freshStore.getState().init()

    expect(mocks.getSetting).toHaveBeenCalledTimes(2)
    const successState = freshStore.getState()
    expect(successState.initialized).toBe(true)
    expect(successState.status.lastError).toBeNull()
  })
})
