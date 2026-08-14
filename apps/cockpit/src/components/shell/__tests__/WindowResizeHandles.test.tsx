import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowResizeHandles } from '@/components/shell/WindowResizeHandles'

const mocks = vi.hoisted(() => ({
  isMacOS: vi.fn(),
  startResizeDragging: vi.fn(),
}))

vi.mock('@/lib/platform', () => ({
  isMacOS: mocks.isMacOS,
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

describe('WindowResizeHandles', () => {
  it('renders nothing on macOS (native edge resize is kept)', () => {
    mocks.isMacOS.mockReturnValue(true)
    const { container } = render(<WindowResizeHandles />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders all 8 edge/corner handles on non-macOS platforms', () => {
    mocks.isMacOS.mockReturnValue(false)
    render(<WindowResizeHandles />)
    expect(screen.getByTestId('resize-handle-North')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-South')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-East')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-West')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-NorthEast')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-NorthWest')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-SouthEast')).toBeInTheDocument()
    expect(screen.getByTestId('resize-handle-SouthWest')).toBeInTheDocument()
  })

  it('calls startResizeDragging with the matching direction on mousedown', () => {
    mocks.isMacOS.mockReturnValue(false)
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 0 })
    expect(mocks.startResizeDragging).toHaveBeenCalledWith('East')
  })

  it('ignores non-primary-button mousedown', () => {
    mocks.isMacOS.mockReturnValue(false)
    render(<WindowResizeHandles />)

    fireEvent.mouseDown(screen.getByTestId('resize-handle-East'), { button: 2 })
    expect(mocks.startResizeDragging).not.toHaveBeenCalled()
  })
})
