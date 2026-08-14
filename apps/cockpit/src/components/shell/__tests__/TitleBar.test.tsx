import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBar } from '@/components/shell/TitleBar'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useNotesStore } from '@/stores/notes.store'
import { DEFAULT_SETTINGS } from '@/types/models'
import type { Note } from '@/types/models'

const mocks = vi.hoisted(() => ({
  platform: { current: 'mac' as 'mac' | 'windows' },
  focusNativeWindow: vi.fn(),
  isNativeWindowMaximized: vi.fn(),
}))

vi.mock('@/lib/native-window', () => ({
  focusNativeWindow: mocks.focusNativeWindow,
  isNativeWindowMaximized: mocks.isNativeWindowMaximized,
  minimizeNativeWindow: vi.fn().mockResolvedValue(undefined),
  toggleNativeWindowMaximize: vi.fn().mockResolvedValue(true),
  closeNativeWindow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/platform', () => ({
  detectPlatform: () => mocks.platform.current,
  getModKey: (p: string) => (p === 'mac' ? 'Cmd' : 'Ctrl'),
  getModKeySymbol: (p: string) => (p === 'mac' ? '⌘' : 'Ctrl'),
  isMacOS: () => mocks.platform.current === 'mac',
}))

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    isFocused: vi.fn().mockResolvedValue(true),
    onResized: vi.fn().mockResolvedValue(() => {}),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}))

function makeNote(id: string): Note {
  return {
    id,
    title: 'Note',
    content: '',
    color: 'yellow',
    pinned: false,
    poppedOut: false,
    windowBounds: null,
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Note
}

beforeEach(() => {
  mocks.platform.current = 'mac'
  mocks.focusNativeWindow.mockResolvedValue(undefined)
  mocks.isNativeWindowMaximized.mockResolvedValue(false)
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, initialized: true })
  useUiStore.setState({
    activeTabId: null,
    activeTool: '',
    commandPaletteOpen: false,
    tabs: [],
  })
  useNotesStore.setState({ notes: [] })

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TitleBar — moved buttons', () => {
  it('renders the notes, settings, and shortcuts buttons with the expected aria-labels', () => {
    render(<TitleBar />)
    expect(screen.getByLabelText('Toggle notes drawer')).toBeInTheDocument()
    expect(screen.getByLabelText('Open settings')).toBeInTheDocument()
    expect(screen.getByLabelText('Open keyboard shortcuts')).toBeInTheDocument()
  })

  it('toggles the notes drawer via the settings store', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Toggle notes drawer'))
    expect(useSettingsStore.getState().notesDrawerOpen).toBe(!DEFAULT_SETTINGS.notesDrawerOpen)
  })

  it('opens the settings panel via the ui store', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Open settings'))
    expect(useUiStore.getState().settingsPanelOpen).toBe(true)
  })

  it('opens the shortcuts modal via the ui store', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('Open keyboard shortcuts'))
    expect(useUiStore.getState().shortcutsModalOpen).toBe(true)
  })

  it('shows the notes badge only when notes exist', () => {
    const { rerender } = render(<TitleBar />)
    const notesButton = screen.getByLabelText('Toggle notes drawer')
    expect(notesButton.querySelector('.bg-\\[var\\(--color-accent\\)\\]')).not.toBeInTheDocument()

    useNotesStore.setState({ notes: [makeNote('1')] })
    rerender(<TitleBar />)

    expect(
      screen
        .getByLabelText('Toggle notes drawer')
        .querySelector('.bg-\\[var\\(--color-accent\\)\\]')
    ).toBeInTheDocument()
  })
})

describe('TitleBar — command palette trigger', () => {
  it('opens the command palette when clicked', () => {
    render(<TitleBar />)
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search tools and commands' }))
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })

  it('preserves pointer focus until the palette input mounts and accepts search text', () => {
    render(
      <>
        <TitleBar />
      </>
    )

    const input = screen.getByRole('combobox', { name: 'Search tools and commands' })
    fireEvent.focus(input)
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'base64' } })
    expect(input).toHaveValue('base64')
    expect(screen.getByRole('option', { name: /Base64/ })).toBeInTheDocument()
  })

  it('shows a placeholder when no tool is active', () => {
    render(<TitleBar />)
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Search tools and commands')
  })

  it('shows the active tool name when a tool is open', () => {
    useUiStore.setState({ activeTool: 'base64' })
    render(<TitleBar />)
    expect(screen.getByRole('combobox')).toHaveAttribute('placeholder', 'Base64')
  })
})

describe('TitleBar — platform layout', () => {
  it('renders window controls on the left (traffic lights) and none on the right on macOS', () => {
    mocks.platform.current = 'mac'
    render(<TitleBar />)
    expect(screen.getByTestId('titlebar-mac-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('titlebar-right-controls')).not.toBeInTheDocument()
  })

  it('renders window controls on the right, and none on the left, on non-macOS', () => {
    mocks.platform.current = 'windows'
    render(<TitleBar />)
    expect(screen.getByTestId('titlebar-right-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('titlebar-mac-controls')).not.toBeInTheDocument()
  })
})

describe('TitleBar — drag region', () => {
  it('uses a background drag layer that never contains interactive children', () => {
    const { container } = render(<TitleBar />)
    const bar = container.firstElementChild as HTMLElement
    expect(bar).not.toHaveAttribute('data-tauri-drag-region')

    const dragRegion = screen.getByTestId('titlebar-drag-region')
    expect(dragRegion).toHaveAttribute('data-tauri-drag-region')
    expect(dragRegion.querySelector('button, input, a')).toBeNull()

    const buttons = bar.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach((button) => {
      expect(button).not.toHaveAttribute('data-tauri-drag-region')
    })
  })
})
