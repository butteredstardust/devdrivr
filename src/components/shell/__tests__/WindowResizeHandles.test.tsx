import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowResizeHandles } from '@/components/shell/WindowResizeHandles'

const mocks = vi.hoisted(() => ({
  startResize: vi.fn(),
  isMacOS: vi.fn(),
}))

vi.mock('@/lib/native-window', () => ({
  startNativeWindowResize: mocks.startResize,
}))

vi.mock('@/lib/platform', () => ({
  isMacOS: mocks.isMacOS,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.startResize.mockResolvedValue(undefined)
  mocks.isMacOS.mockReturnValue(false)
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
  it('renders all 8 edge/corner handles on an undecorated frame', () => {
    render(<WindowResizeHandles />)
    for (const direction of ALL_DIRECTIONS) {
      expect(screen.getByTestId(`resize-handle-${direction}`)).toBeInTheDocument()
    }
  })

  it('calls startResizeDragging with the matching direction on mousedown', () => {
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 0 })
    expect(mocks.startResize).toHaveBeenCalledWith('East')
  })

  // macOS keeps its AppKit frame, which tracks its own edges. Drawn handles there would sit on top
  // of the native resize area and start a second, competing drag.
  it('renders nothing on macOS', () => {
    mocks.isMacOS.mockReturnValue(true)
    const { container } = render(<WindowResizeHandles />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores non-primary-button mousedown', () => {
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 2 })
    expect(mocks.startResize).not.toHaveBeenCalled()
  })

  it('contains native resize-drag failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.startResize.mockRejectedValueOnce(new Error('not resizable'))
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 0 })

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[WindowResizeHandles] startResizeDragging failed:',
        expect.any(Error)
      )
    )
  })
})
