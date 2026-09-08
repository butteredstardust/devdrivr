import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowControls } from '@/components/shell/WindowControls'

const mocks = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  toggleFullscreen: vi.fn(),
  close: vi.fn(),
  useWindowControls: vi.fn(),
}))

vi.mock('@/hooks/useWindowControls', () => ({
  useWindowControls: mocks.useWindowControls,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useWindowControls.mockReturnValue({
    isMaximized: false,
    isFullscreen: false,
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    toggleFullscreen: mocks.toggleFullscreen,
    close: mocks.close,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WindowControls', () => {
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
      minimize: mocks.minimize,
      toggleMaximize: mocks.toggleMaximize,
      toggleFullscreen: mocks.toggleFullscreen,
      close: mocks.close,
    })
    render(<WindowControls />)
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  })
})
