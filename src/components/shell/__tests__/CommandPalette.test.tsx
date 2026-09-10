import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'

const windowApi = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(),
  focusNativeWindow: vi.fn(),
}))

vi.mock('@/lib/native-window', () => ({
  focusNativeWindow: windowApi.focusNativeWindow,
}))

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => windowApi,
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn().mockResolvedValue(null),
}))

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  windowApi.setAlwaysOnTop.mockResolvedValue(undefined)
  windowApi.focusNativeWindow.mockResolvedValue(undefined)

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    },
  })

  window.Element.prototype.scrollIntoView = vi.fn()

  useUiStore.setState({
    activeTabId: null,
    activeTool: '',
    commandPaletteOpen: true,
    commandPaletteIntent: 'switch',
    recentToolIds: [],
    tabMru: [],
    tabs: [],
  })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
})

describe('CommandPalette', () => {
  it('only references the results list while it is rendered', () => {
    useUiStore.setState({ commandPaletteOpen: false })

    render(<CommandPalette />)
    const input = screen.getByRole('combobox')

    expect(input).not.toHaveAttribute('aria-controls')
    expect(input).toHaveAttribute('aria-expanded', 'false')

    fireEvent.pointerDown(input)

    expect(input).toHaveAttribute('aria-controls', 'command-palette-results')
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('uses dialog and combobox semantics with an active descendant', () => {
    render(<CommandPalette />)

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    const input = screen.getByRole('combobox')

    expect(input).toHaveAttribute('aria-controls', 'command-palette-results')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', 'command-palette-option-code-formatter')
    expect(screen.getByRole('option', { name: /Code Formatter/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('option', { name: /Code Formatter/ })).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(input, { key: 'Tab' })
    expect(document.activeElement).toBe(input)
  })

  it('renders state-aware action names and Phosphor icons', () => {
    useSettingsStore.setState({
      sidebarCollapsed: true,
      notesDrawerOpen: true,
      alwaysOnTop: true,
      theme: 'dracula',
    })

    render(<CommandPalette />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '>' } })

    expect(screen.getByRole('option', { name: /Show Sidebar/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Close Notes/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Unpin Window/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Change Theme \(Dracula\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Toggle Sidebar/ })).not.toBeInTheDocument()

    const sidebarAction = screen.getByRole('option', { name: /Show Sidebar/ })
    expect(sidebarAction.querySelector('svg')).not.toBeNull()
  })

  it('searches tools by group label and id aliases', () => {
    render(<CommandPalette />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'network' } })
    expect(screen.getByRole('option', { name: /API Client/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Docs Browser/ })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'url codec' } })
    expect(screen.getByRole('option', { name: /URL Encode\/Decode/ })).toBeInTheDocument()
  })

  it('supports Home, End, and wraparound arrow navigation', () => {
    render(<CommandPalette />)
    const input = screen.getByRole('combobox')
    const lastOption = () => {
      const options = screen.getAllByRole('option')
      return options[options.length - 1]!
    }

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(lastOption()).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Home' })
    expect(screen.getByRole('option', { name: /Code Formatter/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    fireEvent.keyDown(input, { key: 'End' })
    expect(lastOption()).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the mod+digit tab binding on rows for tools that are open in a tab', () => {
    useUiStore.setState({
      tabs: [
        { id: 't1', toolId: 'json-tools' },
        { id: 't2', toolId: 'base64' },
      ],
    })

    render(<CommandPalette />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'base64' } })

    // Second tab → the second digit. The binding exists in useGlobalShortcuts but
    // was invisible everywhere except the shortcuts modal.
    const option = screen.getByRole('option', { name: /Base64/ })
    expect(option.textContent).toMatch(/2$/)
  })

  it('leaves rows for tools with no open tab unbadged', () => {
    useUiStore.setState({ tabs: [] })

    render(<CommandPalette />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'base64' } })

    expect(screen.getByRole('option', { name: /Base64/ }).textContent).not.toMatch(/[1-9]$/)
  })

  /**
   * The new-tab button and every other route in share one palette, so the intent decides what
   * picking a tool means. A button labelled "New tab" that focuses an existing tab is a bug.
   */
  describe('new-tab intent', () => {
    const markdown = { id: 't1', toolId: 'markdown-editor', stateKey: 'markdown-editor' }

    it('opens a second instance of a tool that is already open', () => {
      useUiStore.setState({
        tabs: [markdown],
        activeTabId: 't1',
        activeTool: 'markdown-editor',
        commandPaletteIntent: 'new-tab',
      })

      render(<CommandPalette />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'markdown' } })
      fireEvent.click(screen.getByRole('option', { name: /^Markdown Editor/ }))

      const { tabs, activeTabId } = useUiStore.getState()
      expect(tabs.filter((tab) => tab.toolId === 'markdown-editor')).toHaveLength(2)
      expect(activeTabId).not.toBe('t1')
    })

    it('returns to the open tab under the switch intent', () => {
      useUiStore.setState({
        tabs: [markdown, { id: 't2', toolId: 'base64', stateKey: 'base64' }],
        activeTabId: 't2',
        activeTool: 'base64',
        commandPaletteIntent: 'switch',
      })

      render(<CommandPalette />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'markdown' } })
      fireEvent.click(screen.getByRole('option', { name: /^Markdown Editor/ }))

      expect(useUiStore.getState().tabs).toHaveLength(2)
      expect(useUiStore.getState().activeTabId).toBe('t1')
    })

    it('survives a click on the search field it is about to be typed into', () => {
      useUiStore.setState({
        tabs: [markdown],
        activeTabId: 't1',
        activeTool: 'markdown-editor',
        commandPaletteIntent: 'new-tab',
      })

      render(<CommandPalette />)
      fireEvent.pointerDown(screen.getByRole('combobox'))

      expect(useUiStore.getState().commandPaletteIntent).toBe('new-tab')

      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'markdown' } })
      fireEvent.click(screen.getByRole('option', { name: /^Markdown Editor/ }))

      expect(useUiStore.getState().tabs).toHaveLength(2)
    })

    it('says which mode it is in', () => {
      useUiStore.setState({ commandPaletteIntent: 'new-tab' })

      render(<CommandPalette />)

      expect(screen.getByText('New tab')).toBeInTheDocument()
      expect(screen.getByRole('combobox').getAttribute('placeholder')).toContain('new tab')
    })

    it('gives the action chip precedence over the new-tab chip', () => {
      useUiStore.setState({ commandPaletteIntent: 'new-tab' })

      render(<CommandPalette />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '>' } })

      expect(screen.getByText('Actions')).toBeInTheDocument()
      expect(screen.queryByText('New tab')).not.toBeInTheDocument()
    })
  })

  describe('duplicate tab action', () => {
    const markdown = { id: 't1', toolId: 'markdown-editor', stateKey: 'markdown-editor' }

    it('finds the command and opens a second instance of the active tool', () => {
      useUiStore.setState({
        tabs: [markdown],
        activeTabId: 't1',
        activeTool: 'markdown-editor',
      })

      render(<CommandPalette />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'duplicate' } })
      fireEvent.click(screen.getByRole('option', { name: /Duplicate Tab/ }))

      expect(
        useUiStore.getState().tabs.filter((tab) => tab.toolId === 'markdown-editor')
      ).toHaveLength(2)
    })

    it('omits the command when no tool is active', () => {
      render(<CommandPalette />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'duplicate' } })

      expect(screen.queryByRole('option', { name: /Duplicate Tab/ })).not.toBeInTheDocument()
    })
  })

  it('does not persist always-on-top when the window pin call fails', async () => {
    windowApi.setAlwaysOnTop.mockRejectedValueOnce(new Error('blocked'))
    useSettingsStore.setState({ alwaysOnTop: false })

    render(<CommandPalette />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '>pin' } })
    fireEvent.click(screen.getByRole('option', { name: /Pin Window/ }))

    await waitFor(() => expect(windowApi.setAlwaysOnTop).toHaveBeenCalledWith(true))
    expect(useSettingsStore.getState().alwaysOnTop).toBe(false)
  })
})
