import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CommandPalette } from '@/components/shell/CommandPalette'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { DEFAULT_SETTINGS } from '@/types/models'

const windowApi = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(),
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
    recentToolIds: [],
    tabs: [],
  })
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
})

describe('CommandPalette', () => {
  it('uses dialog and combobox semantics with an active descendant', () => {
    render(<CommandPalette />)

    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    const input = within(dialog).getByRole('combobox')

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
