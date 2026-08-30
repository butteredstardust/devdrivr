import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyCombo } from '@/lib/keybindings'
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts'

type Registration = {
  combo: KeyCombo
  handler: () => unknown
}

const mocks = vi.hoisted(() => ({
  registrations: [] as Registration[],
  toggleCommandPalette: vi.fn(),
  setActiveTool: vi.fn(),
  addToast: vi.fn(),
  toggleSettingsPanel: vi.fn(),
  toggleShortcutsModal: vi.fn(),
  setActiveTab: vi.fn(),
  closeTab: vi.fn(),
  toggleTheme: vi.fn(),
  update: vi.fn(),
  dispatchToolAction: vi.fn(),
  supportsToolFileAction: vi.fn(),
  openFileDialog: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  toggleFullscreen: vi.fn(),
  uiState: {
    activeTool: 'tool-b',
    tabs: [
      { id: 'tab-1', toolId: 'tool-a' },
      { id: 'tab-2', toolId: 'tool-b' },
      { id: 'tab-3', toolId: 'tool-c' },
    ],
    activeTabId: 'tab-2',
  },
  settingsState: {
    sidebarCollapsed: false,
    notesDrawerOpen: false,
    alwaysOnTop: false,
  },
}))

vi.mock('@/hooks/useKeyboardShortcut', () => ({
  useKeyboardShortcut: (combo: KeyCombo, handler: () => unknown) => {
    mocks.registrations.push({ combo, handler })
  },
}))

vi.mock('@/stores/ui.store', () => ({
  useUiStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...mocks.uiState,
      toggleCommandPalette: mocks.toggleCommandPalette,
      setActiveTool: mocks.setActiveTool,
      addToast: mocks.addToast,
      toggleSettingsPanel: mocks.toggleSettingsPanel,
      toggleShortcutsModal: mocks.toggleShortcutsModal,
      setActiveTab: mocks.setActiveTab,
      closeTab: mocks.closeTab,
    }),
}))

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...mocks.settingsState,
      toggleTheme: mocks.toggleTheme,
      update: mocks.update,
    }),
}))

vi.mock('@/app/tool-registry', () => ({
  TOOLS: [{ id: 'tool-a' }, { id: 'tool-b' }, { id: 'tool-c' }],
}))

vi.mock('@/lib/tool-actions', () => ({
  dispatchToolAction: mocks.dispatchToolAction,
  supportsToolFileAction: mocks.supportsToolFileAction,
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: mocks.openFileDialog,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setAlwaysOnTop: mocks.setAlwaysOnTop,
  }),
}))

vi.mock('@/lib/native-window', () => ({
  toggleNativeWindowFullscreen: mocks.toggleFullscreen,
}))

function findShortcut(key: string, shift = false): Registration {
  const registration = mocks.registrations.find(
    ({ combo }) => combo.key === key && Boolean(combo.shift) === shift
  )
  if (!registration) throw new Error(`Shortcut not registered: ${shift ? 'Shift+' : ''}${key}`)
  return registration
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    mocks.registrations.length = 0
    vi.clearAllMocks()
    mocks.uiState.activeTool = 'tool-b'
    mocks.uiState.tabs = [
      { id: 'tab-1', toolId: 'tool-a' },
      { id: 'tab-2', toolId: 'tool-b' },
      { id: 'tab-3', toolId: 'tool-c' },
    ]
    mocks.uiState.activeTabId = 'tab-2'
    mocks.settingsState.sidebarCollapsed = false
    mocks.settingsState.notesDrawerOpen = false
    mocks.settingsState.alwaysOnTop = false
    mocks.update.mockResolvedValue(true)
    mocks.toggleTheme.mockResolvedValue(undefined)
    mocks.setAlwaysOnTop.mockResolvedValue(undefined)
    mocks.toggleFullscreen.mockResolvedValue({ isMaximized: false, isFullscreen: true })
    mocks.openFileDialog.mockResolvedValue(null)
    mocks.supportsToolFileAction.mockReturnValue(true)
  })

  function renderShortcuts() {
    return renderHook(() => useGlobalShortcuts())
  }

  it('dispatches shell overlay and persisted setting shortcuts', async () => {
    renderShortcuts()

    await act(async () => {
      findShortcut('k').handler()
      findShortcut('b').handler()
      findShortcut('n', true).handler()
      findShortcut('t', true).handler()
      findShortcut(',').handler()
      findShortcut('/').handler()
      await findShortcut('p', true).handler()
    })

    expect(mocks.toggleCommandPalette).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledWith('sidebarCollapsed', true)
    expect(mocks.update).toHaveBeenCalledWith('notesDrawerOpen', true)
    expect(mocks.toggleTheme).toHaveBeenCalledOnce()
    expect(mocks.toggleSettingsPanel).toHaveBeenCalledOnce()
    expect(mocks.toggleShortcutsModal).toHaveBeenCalledOnce()
    expect(mocks.setAlwaysOnTop).toHaveBeenCalledWith(true)
    expect(mocks.update).toHaveBeenCalledWith('alwaysOnTop', true)
  })

  it('toggles full screen through the native command bridge', async () => {
    renderShortcuts()

    await act(async () => {
      await findShortcut('F11').handler()
    })

    expect(mocks.toggleFullscreen).toHaveBeenCalledOnce()
  })

  it('does not persist window pin state when the native update fails', async () => {
    mocks.setAlwaysOnTop.mockRejectedValueOnce(new Error('native failure'))
    renderShortcuts()

    await act(async () => {
      await findShortcut('p', true).handler()
    })

    expect(mocks.update).not.toHaveBeenCalledWith('alwaysOnTop', true)
    expect(mocks.addToast).toHaveBeenCalledWith('Failed to update window pin state', 'error')
  })

  it('rolls back native window pin state when persistence fails', async () => {
    mocks.update.mockResolvedValueOnce(false)
    renderShortcuts()

    await act(async () => {
      await findShortcut('p', true).handler()
    })

    expect(mocks.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true)
    expect(mocks.setAlwaysOnTop).toHaveBeenNthCalledWith(2, false)
    expect(mocks.addToast).not.toHaveBeenCalled()
  })

  it('navigates tools forward and backward with wraparound support', () => {
    mocks.uiState.activeTool = 'tool-c'
    const first = renderShortcuts()

    act(() => {
      findShortcut(']').handler()
    })
    first.unmount()

    mocks.registrations.length = 0
    mocks.uiState.activeTool = 'tool-a'
    renderShortcuts()

    act(() => {
      findShortcut('[').handler()
    })

    expect(mocks.setActiveTool).toHaveBeenNthCalledWith(1, 'tool-a')
    expect(mocks.setActiveTool).toHaveBeenNthCalledWith(2, 'tool-c')
  })

  it('dispatches execute, copy-output, and save-file actions', () => {
    renderShortcuts()

    act(() => {
      findShortcut('Enter').handler()
      findShortcut('c', true).handler()
      findShortcut('s').handler()
    })

    expect(mocks.dispatchToolAction).toHaveBeenNthCalledWith(1, { type: 'execute' })
    expect(mocks.dispatchToolAction).toHaveBeenNthCalledWith(2, { type: 'copy-output' })
    expect(mocks.dispatchToolAction).toHaveBeenNthCalledWith(3, { type: 'save-file' })
  })

  it('switches numbered workspace tabs and closes the active tab', () => {
    renderShortcuts()

    act(() => {
      findShortcut('1').handler()
      findShortcut('3').handler()
      findShortcut('9').handler()
      findShortcut('w').handler()
    })

    expect(mocks.setActiveTab).toHaveBeenNthCalledWith(1, 'tab-1')
    expect(mocks.setActiveTab).toHaveBeenNthCalledWith(2, 'tab-3')
    expect(mocks.setActiveTab).toHaveBeenCalledTimes(2)
    expect(mocks.closeTab).toHaveBeenCalledWith('tab-2')
  })

  it('opens a selected file and dispatches its content to the active tool', async () => {
    mocks.openFileDialog.mockResolvedValue({
      content: '{"valid":true}',
      filename: 'example.json',
      path: '/tmp/example.json',
    })
    renderShortcuts()

    await act(async () => {
      await findShortcut('o').handler()
    })

    expect(mocks.dispatchToolAction).toHaveBeenCalledWith({
      type: 'open-file',
      content: '{"valid":true}',
      filename: 'example.json',
      path: '/tmp/example.json',
    })
    expect(mocks.addToast).toHaveBeenCalledWith('Opened example.json', 'success')
  })

  it('does not dispatch an open-file action when selection is cancelled', async () => {
    renderShortcuts()

    await act(async () => {
      await findShortcut('o').handler()
    })

    expect(mocks.dispatchToolAction).not.toHaveBeenCalled()
    expect(mocks.addToast).not.toHaveBeenCalled()
  })

  it('reports unsupported file errors without dispatching content', async () => {
    mocks.openFileDialog.mockRejectedValue(new Error('Unsupported binary file'))
    renderShortcuts()

    await act(async () => {
      await findShortcut('o').handler()
    })

    expect(mocks.dispatchToolAction).not.toHaveBeenCalled()
    expect(mocks.addToast).toHaveBeenCalledWith('Unsupported binary file', 'error')
  })

  it('does not open or save files for unsupported tools', async () => {
    mocks.supportsToolFileAction.mockReturnValue(false)
    renderShortcuts()

    await act(async () => {
      await findShortcut('o').handler()
      findShortcut('s').handler()
    })

    expect(mocks.openFileDialog).not.toHaveBeenCalled()
    expect(mocks.dispatchToolAction).not.toHaveBeenCalled()
    expect(mocks.addToast).toHaveBeenCalledWith(
      'Open File is not supported by the active tool',
      'error'
    )
    expect(mocks.addToast).toHaveBeenCalledWith(
      'Save Output is not supported by the active tool',
      'error'
    )
  })
})
