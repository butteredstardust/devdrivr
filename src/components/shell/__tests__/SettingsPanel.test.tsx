import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/shell/SettingsPanel'
import { useHistoryStore } from '@/stores/history.store'
import { useNotesStore } from '@/stores/notes.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useSnippetsStore } from '@/stores/snippets.store'
import { useApiStore } from '@/stores/api.store'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { exportFile, openFileDialog } from '@/lib/file-io'
import { DEFAULT_MCP_PERMISSIONS, useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import { useUpdaterStore } from '@/stores/updater.store'
import { DEFAULT_SETTINGS } from '@/types/models'

const windowApi = vi.hoisted(() => ({ setAlwaysOnTop: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    running: true,
    host: '127.0.0.1',
    port: 17347,
    url: 'http://127.0.0.1:17347/mcp',
    lastError: null,
  }),
}))

vi.mock('@/lib/file-io', () => ({
  exportFile: vi.fn(),
  openFileDialog: vi.fn(),
  buildExportFilename: (base: string, extension: string) => `${base}.${extension}`,
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0'),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi,
}))

// The store is a module singleton and one test below swaps `update` for a spy. Without
// restoring it here, the next test's "real" update call is the previous test's mock.
const realSettingsUpdate = useSettingsStore.getState().update

beforeEach(() => {
  vi.clearAllMocks()
  windowApi.setAlwaysOnTop.mockResolvedValue(undefined)
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true, update: realSettingsUpdate })
  // Also a module singleton: without this the staged-update test below leaks into the others.
  useUpdaterStore.setState({
    updateInfo: null,
    dismissed: false,
    isChecking: false,
    isDownloading: false,
    isReady: false,
    progress: null,
  })
  useNotesStore.setState({
    notes: [
      {
        id: 'note-1',
        title: 'Test note',
        content: '',
        color: 'yellow',
        pinned: false,
        poppedOut: false,
        createdAt: 1,
        updatedAt: 1,
        tags: [],
        sortOrder: 1024,
      },
    ],
    clearAll: vi.fn().mockResolvedValue(undefined),
  })
  useSnippetsStore.setState({ snippets: [], clearAll: vi.fn().mockResolvedValue(undefined) })
  // Settings → Data initialises both lazily loaded tools, so every path here needs a stub.
  useApiStore.setState({
    requests: [],
    collections: [],
    environments: [],
    activeEnvironmentId: null,
    init: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
    importApiData: vi.fn().mockResolvedValue({ requests: 2, collections: 1, environments: 0 }),
  })
  usePromptTemplatesStore.setState({
    userTemplates: [],
    init: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
    importMany: vi.fn().mockResolvedValue([]),
  })
  useHistoryStore.setState({ entries: [], clearAll: vi.fn().mockResolvedValue(undefined) })
  useUiStore.setState({
    settingsPanelOpen: true,
    addToast: vi.fn(),
  })
  useMcpStore.setState({
    initialized: true,
    pending: false,
    settings: {
      enabled: true,
      host: '127.0.0.1',
      port: 17347,
      apiKey: 'test-key',
      permissions: DEFAULT_MCP_PERMISSIONS,
      apiRequestsExposeSecrets: false,
    },
    status: {
      running: true,
      host: '127.0.0.1',
      port: 17347,
      url: 'http://127.0.0.1:17347/mcp',
      lastError: null,
    },
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue(undefined),
  })
})

afterEach(cleanup)

describe('SettingsPanel', () => {
  it('uses dialog semantics and reports destructive action success', async () => {
    const clearNotes = useNotesStore.getState().clearAll
    const addToast = useUiStore.getState().addToast

    render(<SettingsPanel />)

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trash notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move notes to Trash?' }))

    await waitFor(() => expect(clearNotes).toHaveBeenCalledTimes(1))
    expect(addToast).toHaveBeenCalledWith('Notes moved to Trash', 'success')
  })

  it('exports API requests to a file', async () => {
    const addToast = useUiStore.getState().addToast
    vi.mocked(exportFile).mockResolvedValue('/tmp/devdrivr-api-backup.json')
    useApiStore.setState({
      requests: [
        {
          id: 'req-1',
          name: 'List users',
          method: 'GET',
          url: 'https://example.test/users',
          headers: [],
          body: '',
          bodyMode: 'none',
          auth: { type: 'none' },
          collectionId: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    })

    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export API requests to a file' }))

    await waitFor(() => expect(exportFile).toHaveBeenCalledOnce())
    const [json, filename] = vi.mocked(exportFile).mock.calls[0]!
    expect(filename).toBe('devdrivr-api-backup.json')
    expect(String(json)).toContain('List users')
    expect(addToast).toHaveBeenCalledWith('1 API requests exported', 'success')
  })

  it('leaves the store untouched when the import dialog is dismissed', async () => {
    // A cancelled dialog resolves null. Treating that as an empty import would wipe the library.
    vi.mocked(openFileDialog).mockResolvedValue(null)
    const importApiData = useApiStore.getState().importApiData
    const addToast = useUiStore.getState().addToast

    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import API requests from a file' }))

    await waitFor(() => expect(openFileDialog).toHaveBeenCalledOnce())
    expect(importApiData).not.toHaveBeenCalled()
    expect(addToast).not.toHaveBeenCalled()
  })

  it('deletes custom prompt templates only after a confirm', async () => {
    const clearTemplates = usePromptTemplatesStore.getState().clearAll

    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete templates' }))
    expect(clearTemplates).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently?' }))
    await waitFor(() => expect(clearTemplates).toHaveBeenCalledOnce())
  })

  it('rejects invalid MCP port input with feedback', async () => {
    const addToast = useUiStore.getState().addToast
    const updateSettings = useMcpStore.getState().updateSettings

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))
    const portInput = screen.getByRole('spinbutton', { name: 'Port' })
    expect(portInput).toHaveAccessibleDescription('Localhost port for Streamable HTTP')
    fireEvent.change(portInput, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(addToast).toHaveBeenCalledWith(
      'MCP port must be a number between 1024 and 65535',
      'error'
    )
    expect(updateSettings).not.toHaveBeenCalled()

    fireEvent.change(portInput, { target: { value: '70000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(addToast).toHaveBeenCalledWith('MCP port must be between 1024 and 65535', 'error')
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('surfaces MCP lifecycle failures without closing settings', async () => {
    const addToast = useUiStore.getState().addToast
    const start = vi.fn().mockRejectedValue(new Error('port unavailable'))
    useMcpStore.setState({ start })

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(start).toHaveBeenCalledOnce())
    expect(addToast).toHaveBeenCalledWith('port unavailable', 'error')
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders unexpected MCP shutdown errors as non-blocking status feedback', () => {
    useMcpStore.setState({
      status: {
        running: false,
        host: '127.0.0.1',
        port: 17347,
        url: 'http://127.0.0.1:17347/mcp',
        lastError: 'MCP server stopped unexpectedly',
      },
    })

    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))

    expect(screen.getByText('MCP server stopped unexpectedly')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('switches the shell layout between floating and flush', async () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })

    render(<SettingsPanel />)

    // SegmentedControl exposes its segments as a radiogroup, not buttons.
    const group = screen.getByRole('radiogroup', { name: 'Shell layout' })
    expect(within(group).getByRole('radio', { name: 'Floating' })).toBeChecked()

    fireEvent.click(within(group).getByRole('radio', { name: 'Flush' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('shellStyle', 'flush'))
  })

  // The picker is 20+ live previews. It has its own tab so it does not sit under the window and
  // updater rows, and so General does not scroll.
  it('keeps the theme picker on its own tab', async () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })

    render(<SettingsPanel />)

    expect(screen.queryByRole('option', { name: 'Dracula' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Theme' }))

    fireEvent.click(screen.getByRole('option', { name: 'Dracula' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('theme', 'dracula'))
  })

  it('names every setting row control from the row label', async () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }))

    // A role="switch" is a <button>, which is not labelable — the row's <label>
    // would name nothing, so the row publishes its label id via context instead.
    const wrap = screen.getByRole('switch', { name: 'Word Wrap' })
    fireEvent.click(wrap)
    await waitFor(() => expect(update).toHaveBeenCalledWith('editorWordWrap', false))

    // Same problem, same fix, for the bare <select> beside a row label.
    expect(screen.getByRole('combobox', { name: 'Render Whitespace' })).toBeInTheDocument()
    expect(wrap).toHaveAccessibleDescription('Wrap long lines instead of scrolling sideways')
  })

  it('commits history retention on blur or Enter and reverts its draft on Escape', async () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))

    const input = screen.getByRole('spinbutton', { name: 'History per Tool' })
    expect(input).toHaveAccessibleDescription('Max entries retained per tool')
    expect(screen.getByText('entries per tool')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.change(input, { target: { value: '50' } })
    expect(update).not.toHaveBeenCalledWith('historyRetentionPerTool', expect.anything())
    fireEvent.blur(input)
    expect(update).toHaveBeenCalledWith('historyRetentionPerTool', 50)

    fireEvent.change(input, { target: { value: '72' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith('historyRetentionPerTool', 72)

    act(() => useSettingsStore.setState({ historyRetentionPerTool: 80 }))
    expect(input).toHaveValue(80)
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue(80)
  })

  it('restores the stored value when a numeric setting is left empty', () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update, historyRetentionPerTool: 120 })
    render(<SettingsPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))

    const input = screen.getByRole('spinbutton', { name: 'History per Tool' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    // A cleared field must not read as 0 and commit the minimum.
    expect(update).toHaveBeenCalledWith('historyRetentionPerTool', 120)
    expect(input).toHaveValue(120)
  })

  it('shows exact panel widths and clamps them only when committed', () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })
    render(<SettingsPanel />)

    const sidebarWidth = screen.getByRole('spinbutton', { name: 'Sidebar Width' })
    const notesWidth = screen.getByRole('spinbutton', { name: 'Notes Drawer Width' })
    expect(screen.getAllByText('px')).toHaveLength(2)

    act(() => useSettingsStore.setState({ sidebarWidth: 300, notesDrawerWidth: 360 }))
    expect(sidebarWidth).toHaveValue(300)
    expect(notesWidth).toHaveValue(360)

    fireEvent.change(sidebarWidth, { target: { value: '999' } })
    expect(update).not.toHaveBeenCalledWith('sidebarWidth', expect.anything())
    fireEvent.blur(sidebarWidth)
    expect(update).toHaveBeenCalledWith('sidebarWidth', 420)

    fireEvent.change(notesWidth, { target: { value: '1' } })
    fireEvent.keyDown(notesWidth, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith('notesDrawerWidth', 280)
  })

  it('groups general settings and disables inert automatic downloads with a visible reason', () => {
    useSettingsStore.setState({ checkForUpdatesAutomatically: false })
    render(<SettingsPanel />)

    for (const section of ['Appearance', 'Window', 'Startup', 'Updates', 'Tool defaults']) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument()
    }
    expect(screen.getByRole('switch', { name: 'Download update automatically' })).toBeDisabled()
    expect(screen.getByText('Turn on automatic update checks to enable downloads')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Default Timezone' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    expect(screen.queryByRole('combobox', { name: 'Default Timezone' })).not.toBeInTheDocument()
  })

  it('persists the new startup, appearance, and editor behavior settings', async () => {
    const update = vi.fn().mockResolvedValue(true)
    useSettingsStore.setState({ update })
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('switch', { name: 'Restore Workspace on Launch' }))
    const recentLimit = screen.getByRole('spinbutton', { name: 'Recent Tools Limit' })
    fireEvent.change(recentLimit, { target: { value: '5' } })
    fireEvent.blur(recentLimit)
    fireEvent.click(screen.getByRole('tab', { name: 'Editor' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Scroll Beyond Last Line' }))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('restoreWorkspaceOnLaunch', false)
      expect(update).toHaveBeenCalledWith('recentToolsLimit', 5)
      expect(update).toHaveBeenCalledWith('editorScrollBeyondLastLine', true)
    })
    expect(screen.getByRole('heading', { name: 'Font and theme' })).toBeInTheDocument()
  })

  // The permission grid is a div grid, not a table: the resource row and the action column name
  // each cell on screen but associate with nothing, so every switch in it announced as unnamed.
  it('names every switch in the MCP permission grid', () => {
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'MCP' }))

    expect(screen.getByRole('switch', { name: 'Notes: read' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Notes: delete' })).toBeInTheDocument()
    expect(
      screen
        .queryAllByRole('switch')
        .every((s) => s.getAttribute('aria-label') || s.getAttribute('aria-labelledby'))
    ).toBe(true)
  })

  it('imports settings that use newer registered themes', async () => {
    const addToast = useUiStore.getState().addToast
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ theme: 'github-light', alwaysOnTop: true })),
        writeText: vi.fn(),
      },
    })

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Import from Clipboard' }))

    await waitFor(() => expect(useSettingsStore.getState().theme).toBe('github-light'))
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true)
    expect(windowApi.setAlwaysOnTop).toHaveBeenCalledWith(true)
    expect(addToast).toHaveBeenCalledWith('Settings imported', 'success')
  })

  it('routes the General pin control through the shared native and persistence update', async () => {
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('switch', { name: 'Always on Top' }))

    await waitFor(() => expect(windowApi.setAlwaysOnTop).toHaveBeenCalledWith(true))
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true)
  })

  // The banner is dismissible and can be switched off, so Settings has to keep a way to install a
  // staged update. Otherwise auto-download strands one with no route to install it.
  it('offers a restart for a staged update even when the banner is dismissed', () => {
    const restartToUpdate = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ notifyWhenUpdateAvailable: false })
    useUpdaterStore.setState({
      updateInfo: { version: '0.2.0', notes: '', pub_date: '2026-04-15' },
      dismissed: true,
      isDownloading: false,
      isReady: true,
      restartToUpdate,
    })

    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Restart to update to v0.2.0' }))
    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })
})
