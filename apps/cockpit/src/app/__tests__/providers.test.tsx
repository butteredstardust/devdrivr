import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'

async function flushMicrotasks(times = 10) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => ({
  settingsInit: vi.fn(),
  settingsState: {
    initialized: false,
    alwaysOnTop: false,
    checkForUpdatesAutomatically: false,
    downloadUpdatesAutomatically: false,
  },
  notesInit: vi.fn(),
  snippetsInit: vi.fn(),
  promptTemplatesInit: vi.fn(),
  historyInit: vi.fn(),
  mcpInit: vi.fn(),
  listen: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getToolById: vi.fn(),
  onMoved: vi.fn(),
  onResized: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  checkForUpdate: vi.fn(),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: Object.assign(
    (selector: (s: typeof mocks.settingsState & { init: unknown }) => unknown) =>
      selector({ ...mocks.settingsState, init: mocks.settingsInit }),
    { getState: () => ({ ...mocks.settingsState, init: mocks.settingsInit }) }
  ),
}))

vi.mock('@/stores/notes.store', () => ({
  useNotesStore: { getState: () => ({ init: mocks.notesInit, refresh: vi.fn() }) },
}))

vi.mock('@/stores/snippets.store', () => ({
  useSnippetsStore: { getState: () => ({ init: mocks.snippetsInit, refresh: vi.fn() }) },
}))

vi.mock('@/stores/prompt-templates.store', () => ({
  usePromptTemplatesStore: {
    getState: () => ({ init: mocks.promptTemplatesInit, refresh: vi.fn() }),
  },
}))

vi.mock('@/stores/history.store', () => ({
  useHistoryStore: { getState: () => ({ init: mocks.historyInit }) },
}))

vi.mock('@/stores/api.store', () => ({
  useApiStore: { getState: () => ({ refresh: vi.fn() }) },
}))

vi.mock('@/stores/mcp.store', () => ({
  useMcpStore: { getState: () => ({ init: mocks.mcpInit }) },
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: { getState: () => ({ restoreTabs: vi.fn(), restoreActiveTool: vi.fn() }) },
}))

vi.mock('@/stores/updater.store', () => ({
  useUpdaterStore: {
    getState: () => ({
      checkForUpdate: mocks.checkForUpdate,
      downloadUpdate: vi.fn(),
      updateInfo: null,
    }),
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setPosition: vi.fn(),
    setSize: vi.fn(),
    setAlwaysOnTop: mocks.setAlwaysOnTop,
    onMoved: mocks.onMoved,
    onResized: mocks.onResized,
    scaleFactor: vi.fn().mockResolvedValue(1),
    outerPosition: vi.fn().mockResolvedValue({ toLogical: () => ({ x: 0, y: 0 }) }),
    outerSize: vi.fn().mockResolvedValue({ toLogical: () => ({ width: 800, height: 600 }) }),
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mocks.listen(...args),
}))

vi.mock('@/lib/db', () => ({
  getSetting: (...args: unknown[]) => mocks.getSetting(...args),
  setSetting: (...args: unknown[]) => mocks.setSetting(...args),
}))

vi.mock('@/app/tool-registry', () => ({
  getToolById: (...args: unknown[]) => mocks.getToolById(...args),
}))

describe('Providers bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsState.initialized = false
    mocks.getSetting.mockResolvedValue(null)
    mocks.setSetting.mockResolvedValue(undefined)
    mocks.getToolById.mockReturnValue(undefined)
    mocks.notesInit.mockResolvedValue(undefined)
    mocks.snippetsInit.mockResolvedValue(undefined)
    mocks.promptTemplatesInit.mockResolvedValue(undefined)
    mocks.historyInit.mockResolvedValue(undefined)
    mocks.mcpInit.mockResolvedValue(undefined)
    mocks.checkForUpdate.mockResolvedValue(undefined)
    // The real window listeners always resolve to an unlisten fn; tests that care about the
    // timing override these with a gate.
    mocks.onMoved.mockResolvedValue(vi.fn())
    mocks.onResized.mockResolvedValue(vi.fn())
    mocks.settingsInit.mockImplementation(async () => {
      mocks.settingsState.initialized = true
    })
  })

  afterEach(() => {
    mocks.settingsState.initialized = false
  })

  it('tears down a listener created just before unmount instead of leaking it', async () => {
    const unlistenMcp = vi.fn()
    const mcpListenGate = deferred<() => void>()
    mocks.listen.mockReturnValue(mcpListenGate.promise)

    const { unmount } = render(<Providers>content</Providers>)

    // Let bootstrap progress through the preceding store-init awaits so it
    // reaches (and suspends on) `await listen(...)`.
    await act(async () => {
      await flushMicrotasks()
    })
    expect(mocks.listen).toHaveBeenCalledTimes(1)

    // Unmount while still awaiting `listen()` — before the fix, `cleanups`
    // would already have been iterated (empty) by the time `listen()`
    // resolves and pushes the unlisten fn into it.
    unmount()

    await act(async () => {
      mcpListenGate.resolve(unlistenMcp)
      await flushMicrotasks()
    })

    expect(unlistenMcp).toHaveBeenCalledTimes(1)
  })

  it('tears down window listeners created just before unmount', async () => {
    const unlistenMoved = vi.fn()
    const unlistenResized = vi.fn()
    mocks.listen.mockResolvedValue(vi.fn())
    const onMovedGate = deferred<() => void>()
    mocks.onMoved.mockReturnValue(onMovedGate.promise)
    mocks.onResized.mockResolvedValue(unlistenResized)

    const { unmount } = render(<Providers>content</Providers>)
    // Let bootstrap progress up to the `onMoved()` await.
    await act(async () => {
      await flushMicrotasks()
    })
    expect(mocks.onMoved).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      onMovedGate.resolve(unlistenMoved)
      await flushMicrotasks()
    })

    expect(unlistenMoved).toHaveBeenCalledTimes(1)
    expect(unlistenResized).not.toHaveBeenCalled()
  })

  it('recovers from a failed init() and offers a retry that succeeds', async () => {
    mocks.settingsInit
      .mockImplementationOnce(async () => {
        throw new Error('database is locked')
      })
      .mockImplementationOnce(async () => {
        mocks.settingsState.initialized = true
      })
    mocks.listen.mockResolvedValue(vi.fn())
    mocks.onMoved.mockResolvedValue(vi.fn())
    mocks.onResized.mockResolvedValue(vi.fn())

    const { getByText, getByRole } = render(<Providers>content</Providers>)

    await waitFor(() => expect(getByText(/Failed to initialize/)).toBeTruthy())

    await act(async () => {
      getByRole('button', { name: /retry/i }).click()
      await Promise.resolve()
    })

    await waitFor(() => expect(mocks.settingsInit).toHaveBeenCalledTimes(2))
  })
})
