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
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Search tools and commands' }))
    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })

  it('stays closed when focus merely passes through on the way across the title bar', () => {
    render(<TitleBar />)
    const input = screen.getByRole('combobox', { name: 'Search tools and commands' })

    fireEvent.focus(input)

    // Opening from focus alone dropped a full-screen scrim over the app the moment a keyboard
    // user tabbed past this field, with no way onward. Only deliberate entries open it.
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens from the keyboard when focus is already on the field', () => {
    render(<TitleBar />)
    const input = screen.getByRole('combobox', { name: 'Search tools and commands' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })

  it('preserves pointer focus until the palette input mounts and accepts search text', () => {
    render(
      <>
        <TitleBar />
      </>
    )

    const input = screen.getByRole('combobox', { name: 'Search tools and commands' })
    fireEvent.pointerDown(input)
    input.focus()
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

describe('TitleBar — palette centring', () => {
  // The palette overlay is 480px wide and centred on the window, so its gutter has to clear the
  // *widest* cluster on both sides — an asymmetric reserve would decentre it, which defeats the
  // point of the overlay. jsdom cannot measure this, so the contract is asserted on the classes.
  it('reserves symmetric space on both sides of the centred palette', () => {
    for (const platform of ['mac', 'windows'] as const) {
      mocks.platform.current = platform
      const { unmount } = render(<TitleBar />)
      const slot = screen.getByTestId('titlebar-palette-slot')

      expect(slot.className).toMatch(/\bpx-\[\d+px\]/)
      expect(slot.className).not.toMatch(/\b(pl|pr)-\[/)
      unmount()
    }
  })

  // Notes leads alone; the two modal, rarely-used buttons trail. Three buttons on the leading edge
  // left 14px between them and the macOS traffic lights, so they read as a fourth window control.
  it('keeps only the notes button ahead of the palette, with settings and shortcuts behind it', () => {
    render(<TitleBar />)
    const slot = screen.getByTestId('titlebar-palette-slot')
    const before = slot.DOCUMENT_POSITION_PRECEDING
    const after = slot.DOCUMENT_POSITION_FOLLOWING

    expect(
      slot.compareDocumentPosition(screen.getByLabelText('Toggle notes drawer')) & before
    ).toBeTruthy()
    expect(
      slot.compareDocumentPosition(screen.getByLabelText('Open settings')) & after
    ).toBeTruthy()
    expect(
      slot.compareDocumentPosition(screen.getByLabelText('Open keyboard shortcuts')) & after
    ).toBeTruthy()
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

  // The drag layer covers the whole bar and captures pointer events, so anything interactive must
  // sit explicitly above it. Two separate ways to get this wrong, both of which have to fail here:
  //   - a static wrapper: an absolutely-positioned layer paints above every non-positioned sibling
  //     regardless of source order (this is how the Windows controls originally broke);
  //   - a wrapper with no z-index: correct only while it happens to follow the drag layer in the
  //     markup, so reordering the JSX silently re-breaks it.
  // Asserting the z-tier rather than mere positioning is what makes the guarantee order-independent,
  // matching the stacking rule documented in styles/tokens.css.
  const zIndexOf = (el: HTMLElement): number | null => {
    const match = /(?:^|\s)z-(\d+)(?:\s|$)/.exec(el.className)
    return match?.[1] ? Number(match[1]) : null
  }

  it.each(['mac', 'windows'] as const)(
    'stacks every interactive cluster explicitly above the drag layer on %s',
    (platform) => {
      mocks.platform.current = platform
      const { container } = render(<TitleBar />)
      const bar = container.firstElementChild as HTMLElement

      const dragRegion = screen.getByTestId('titlebar-drag-region')
      const dragZ = zIndexOf(dragRegion)
      expect(dragZ, 'the drag layer must declare its own z-tier').not.toBeNull()

      const buttons = Array.from(bar.querySelectorAll('button'))
      expect(buttons.length).toBeGreaterThan(0)

      for (const button of buttons) {
        const label = button.getAttribute('aria-label')
        let node: HTMLElement | null = button
        let positioned = false
        let z: number | null = null

        while (node && node !== bar) {
          if (!positioned && /(?:^|\s)(relative|absolute|fixed)(?:\s|$)/.test(node.className)) {
            positioned = true
          }
          if (z === null) z = zIndexOf(node)
          node = node.parentElement
        }

        expect(
          positioned,
          `"${label}" has no positioned wrapper — the drag region will eat its clicks`
        ).toBe(true)
        expect(
          z,
          `"${label}" has no z-tier, so it only works while it follows the drag layer`
        ).not.toBeNull()
        expect(
          z as number,
          `"${label}" sits at z-${z}, not above the drag layer's z-${dragZ}`
        ).toBeGreaterThan(dragZ as number)
      }
    }
  )
})
