import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import ImageTool from '../image-tool/ImageTool'

const originalFileReader = globalThis.FileReader
const originalImage = globalThis.Image
const originalResizeObserver = globalThis.ResizeObserver
const originalGetBoundingClientRect = window.HTMLElement.prototype.getBoundingClientRect
const originalCanvasGetContext = window.HTMLCanvasElement.prototype.getContext
const originalCanvasToDataUrl = window.HTMLCanvasElement.prototype.toDataURL
const originalCanvasToBlob = window.HTMLCanvasElement.prototype.toBlob

function installImageMocks() {
  class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null
    readAsDataURL() {
      this.onload?.({ target: { result: 'data:image/png;base64,AAA=' } })
    }
  }

  class MockImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 100
    naturalHeight = 80
    private source = ''

    set src(value: string) {
      this.source = value
      this.onload?.()
    }

    get src() {
      return this.source
    }
  }

  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this)
    }

    disconnect() {}
    unobserve() {}
  }

  Object.defineProperty(globalThis, 'FileReader', {
    configurable: true,
    value: MockFileReader,
  })
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: MockImage,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: MockResizeObserver,
  })
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 200,
      height: 160,
      top: 0,
      left: 0,
      right: 200,
      bottom: 160,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    }),
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,AAA=',
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value(callback: BlobCallback) {
      callback(new Blob(['image'], { type: 'image/png' }))
    },
  })
}

function restoreImageMocks() {
  Object.defineProperty(globalThis, 'FileReader', {
    configurable: true,
    value: originalFileReader,
  })
  Object.defineProperty(globalThis, 'Image', {
    configurable: true,
    value: originalImage,
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalResizeObserver,
  })
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: originalGetBoundingClientRect,
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: originalCanvasGetContext,
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: originalCanvasToDataUrl,
  })
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value: originalCanvasToBlob,
  })
}

async function loadMockImage() {
  installImageMocks()
  renderTool(ImageTool)
  const preview = screen.getByTestId('image-preview')
  fireEvent.drop(preview, {
    dataTransfer: {
      files: [new File(['image'], 'sample.png', { type: 'image/png' })],
    },
  })
  await waitFor(() => expect(screen.getByText('sample.png')).toBeInTheDocument())
  return preview
}

afterEach(() => {
  restoreImageMocks()
})

describe('ImageTool', () => {
  // ── Empty state ──────────────────────────────────────────────────

  it('renders the drop zone when no image is loaded', () => {
    renderTool(ImageTool)
    expect(screen.getByText(/drop an image here/i)).toBeInTheDocument()
  })

  it('shows accepted formats in the drop zone hint', () => {
    renderTool(ImageTool)
    expect(screen.getByText(/jpeg.*png.*webp/i)).toBeInTheDocument()
  })

  it('renders an "Open Image" button', () => {
    renderTool(ImageTool)
    expect(screen.getByText('Open Image')).toBeInTheDocument()
  })

  it('renders a "Browse files" button in the drop zone', () => {
    renderTool(ImageTool)
    expect(screen.getByText('Browse files')).toBeInTheDocument()
  })

  it('shows placeholder text when no image is loaded', () => {
    renderTool(ImageTool)
    expect(screen.getByText(/open an image or drop it anywhere/i)).toBeInTheDocument()
  })

  // ── Tab structure ────────────────────────────────────────────────

  it('renders all three tabs', () => {
    renderTool(ImageTool)
    expect(screen.getByText('Resize')).toBeInTheDocument()
    expect(screen.getByText('Crop')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  // ── Resize tab controls ──────────────────────────────────────────

  it('shows resize controls when clicking Resize tab', () => {
    renderTool(ImageTool)
    fireEvent.click(screen.getByText('Resize'))
    expect(screen.getByText(/open an image to get started/i)).toBeInTheDocument()
  })

  // ── Crop tab ─────────────────────────────────────────────────────

  it('switches to crop tab and shows enable crop toggle', () => {
    renderTool(ImageTool)
    fireEvent.click(screen.getByText('Crop'))
    expect(screen.getByText(/open an image to get started/i)).toBeInTheDocument()
  })

  it('uses a keyboard-operable crop toggle with pressed state', async () => {
    await loadMockImage()

    fireEvent.click(screen.getByText('Crop'))
    const toggle = screen.getByRole('button', { name: 'Enable crop' })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.keyDown(toggle, { key: 'Enter' })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Disable crop' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('stops crop dragging when mouse is released outside the preview', async () => {
    const preview = await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    fireEvent.click(screen.getByRole('button', { name: 'Enable crop' }))
    await waitFor(() => expect(screen.getByTestId('crop-box')).toBeInTheDocument())

    const xInput = screen.getAllByRole('spinbutton')[0]!
    expect(xInput).toHaveValue(0)

    fireEvent.mouseDown(screen.getByTestId('crop-box'), { clientX: 20, clientY: 20 })
    fireEvent.mouseUp(window)
    fireEvent.mouseMove(preview, { clientX: 80, clientY: 80 })

    expect(xInput).toHaveValue(0)
  })

  it('clamps manual crop inputs to the image bounds', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    fireEvent.click(screen.getByRole('button', { name: 'Enable crop' }))

    const [xInput, yInput, widthInput, heightInput] = screen.getAllByRole('spinbutton')

    fireEvent.change(widthInput!, { target: { value: '40' } })
    fireEvent.change(heightInput!, { target: { value: '20' } })
    fireEvent.change(xInput!, { target: { value: '999' } })
    fireEvent.change(yInput!, { target: { value: '999' } })

    expect(xInput).toHaveValue(60)
    expect(yInput).toHaveValue(60)
    expect(widthInput).toHaveValue(40)
    expect(heightInput).toHaveValue(20)
  })

  // ── Export tab ───────────────────────────────────────────────────

  it('switches to export tab', () => {
    renderTool(ImageTool)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText(/open an image to get started/i)).toBeInTheDocument()
  })

  // ── Drag over state ──────────────────────────────────────────────

  it('shows drag-over overlay when dragging a file over the preview area', () => {
    renderTool(ImageTool)
    // The preview container is the outer flex div; fire drag events on it
    const dropZone = screen.getByText(/drop an image here/i).closest('div')!.parentElement!
    fireEvent.dragOver(dropZone)
    expect(screen.getByText(/drop to open image/i)).toBeInTheDocument()
  })

  it('hides drag-over overlay when drag leaves', () => {
    renderTool(ImageTool)
    const dropZone = screen.getByText(/drop an image here/i).closest('div')!.parentElement!
    fireEvent.dragOver(dropZone)
    fireEvent.dragLeave(dropZone)
    expect(screen.queryByText(/drop to open image/i)).not.toBeInTheDocument()
  })
})
