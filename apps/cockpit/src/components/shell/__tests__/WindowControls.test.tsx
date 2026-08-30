import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowControls } from '@/components/shell/WindowControls'

const mocks = vi.hoisted(() => ({
  isMacOS: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  toggleFullscreen: vi.fn(),
  close: vi.fn(),
  useWindowControls: vi.fn(),
}))

vi.mock('@/lib/platform', () => ({
  isMacOS: mocks.isMacOS,
}))

vi.mock('@/hooks/useWindowControls', () => ({
  useWindowControls: mocks.useWindowControls,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useWindowControls.mockReturnValue({
    isMaximized: false,
    isFullscreen: false,
    isFocused: true,
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    toggleFullscreen: mocks.toggleFullscreen,
    close: mocks.close,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WindowControls on macOS', () => {
  beforeEach(() => mocks.isMacOS.mockReturnValue(true))

  it('renders three traffic lights in close/minimize/full-screen order', () => {
    render(<WindowControls />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toHaveAccessibleName('Close')
    expect(buttons[1]).toHaveAccessibleName('Minimize')
    expect(buttons[2]).toHaveAccessibleName('Enter Full Screen')
  })

  it('invokes the matching window method for each traffic light', () => {
    render(<WindowControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.close).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(mocks.minimize).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Enter Full Screen' }))
    expect(mocks.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('uses Option-click on the green traffic light for macOS zoom', () => {
    render(<WindowControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter Full Screen' }), { altKey: true })
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(mocks.toggleFullscreen).not.toHaveBeenCalled()
  })

  it('offers to exit when the window is full screen', () => {
    mocks.useWindowControls.mockReturnValue({
      isMaximized: false,
      isFullscreen: true,
      isFocused: true,
      minimize: mocks.minimize,
      toggleMaximize: mocks.toggleMaximize,
      toggleFullscreen: mocks.toggleFullscreen,
      close: mocks.close,
    })
    render(<WindowControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Exit Full Screen' }))
    expect(mocks.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('renders the dimmed grey variant when the window is unfocused', () => {
    mocks.useWindowControls.mockReturnValue({
      isMaximized: false,
      isFullscreen: false,
      isFocused: false,
      minimize: mocks.minimize,
      toggleMaximize: mocks.toggleMaximize,
      toggleFullscreen: mocks.toggleFullscreen,
      close: mocks.close,
    })
    render(<WindowControls />)

    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(closeButton.style.backgroundColor).toBe('var(--color-border)')
  })

  it('renders the native colour swatches when focused', () => {
    render(<WindowControls />)
    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(closeButton.style.backgroundColor).toBe('rgb(255, 95, 87)')
  })
})

describe('WindowControls on Windows/Linux', () => {
  beforeEach(() => mocks.isMacOS.mockReturnValue(false))

  it('renders controls in minimize/maximize/close order', () => {
    render(<WindowControls />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[0]).toHaveAccessibleName('Minimize')
    expect(buttons[1]).toHaveAccessibleName('Maximize')
    expect(buttons[2]).toHaveAccessibleName('Close')
  })

  it('invokes the matching window method for each button', () => {
    render(<WindowControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(mocks.minimize).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(mocks.toggleMaximize).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('shows Restore as the accessible name when maximized', () => {
    mocks.useWindowControls.mockReturnValue({
      isMaximized: true,
      isFullscreen: false,
      isFocused: true,
      minimize: mocks.minimize,
      toggleMaximize: mocks.toggleMaximize,
      toggleFullscreen: mocks.toggleFullscreen,
      close: mocks.close,
    })
    render(<WindowControls />)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })
})
