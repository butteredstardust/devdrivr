import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowResizeHandles } from '@/components/shell/WindowResizeHandles'

const mocks = vi.hoisted(() => ({
  startResizeDragging: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    startResizeDragging: mocks.startResizeDragging,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.startResizeDragging.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const ALL_DIRECTIONS = [
  'North',
  'South',
  'East',
  'West',
  'NorthEast',
  'NorthWest',
  'SouthEast',
  'SouthWest',
] as const

describe('WindowResizeHandles', () => {
  // Regression guard: these used to be skipped on macOS on the assumption that `decorations: false`
  // left native edge resizing intact. It does not — the real window could not be resized at all.
  it('renders all 8 edge/corner handles on every platform', () => {
    render(<WindowResizeHandles />)
    for (const direction of ALL_DIRECTIONS) {
      expect(screen.getByTestId(`resize-handle-${direction}`)).toBeInTheDocument()
    }
  })

  it('calls startResizeDragging with the matching direction on mousedown', () => {
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 0 })
    expect(mocks.startResizeDragging).toHaveBeenCalledWith('East')
  })

  it('ignores non-primary-button mousedown', () => {
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 2 })
    expect(mocks.startResizeDragging).not.toHaveBeenCalled()
  })
})
