import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, render, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import ImageTool from '../image-tool/ImageTool'
import { useUiStore } from '@/stores/ui.store'
import { exportFile } from '@/lib/file-io'
import { useToolStateCache } from '@/stores/tool-state.store'

const mocks = vi.hoisted(() => ({
  dragHandler: null as ((event: unknown) => Promise<void>) | null,
  readFile: vi.fn(),
  scaleFactor: vi.fn().mockResolvedValue(2),
  openImageFileDialog: vi.fn(),
  imageWidth: 100,
  imageHeight: 80,
  canvasFillRect: vi.fn(),
  canvasDrawImage: vi.fn(),
  createImageBitmap: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  bitmaps: [] as Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }>,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    scaleFactor: mocks.scaleFactor,
    onDragDropEvent: vi.fn(async (handler: (event: unknown) => Promise<void>) => {
      mocks.dragHandler = handler
      return () => {}
    }),
  }),
}))

vi.mock('@tauri-apps/plugin-fs', async () => {
  const actual =
    await vi.importActual<typeof import('@tauri-apps/plugin-fs')>('@tauri-apps/plugin-fs')
  return { ...actual, readFile: mocks.readFile }
})

vi.mock('@/lib/file-io', async () => {
  const actual = await vi.importActual<typeof import('@/lib/file-io')>('@/lib/file-io')
  return {
    ...actual,
    exportFile: vi.fn(),
    openImageFileDialog: mocks.openImageFileDialog,
  }
})

const originalFileReader = globalThis.FileReader
const originalImage = globalThis.Image
const originalResizeObserver = globalThis.ResizeObserver
const originalGetBoundingClientRect = window.HTMLElement.prototype.getBoundingClientRect
const originalCanvasGetContext = window.HTMLCanvasElement.prototype.getContext
const originalCanvasToDataUrl = window.HTMLCanvasElement.prototype.toDataURL
const originalCanvasToBlob = window.HTMLCanvasElement.prototype.toBlob
const originalCreateImageBitmap = globalThis.createImageBitmap
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

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
    naturalWidth = mocks.imageWidth
    naturalHeight = mocks.imageHeight
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
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: mocks.createImageBitmap,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: mocks.createObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: mocks.revokeObjectURL,
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
      fillRect: mocks.canvasFillRect,
      drawImage: mocks.canvasDrawImage,
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
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
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: originalCreateImageBitmap,
  })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
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

beforeEach(() => {
  mocks.dragHandler = null
  mocks.readFile.mockReset().mockResolvedValue(new Uint8Array([137, 80, 78, 71]))
  mocks.scaleFactor.mockReset().mockResolvedValue(2)
  mocks.openImageFileDialog.mockReset().mockResolvedValue(null)
  mocks.imageWidth = 100
  mocks.imageHeight = 80
  mocks.canvasFillRect.mockReset()
  mocks.canvasDrawImage.mockReset()
  mocks.bitmaps.length = 0
  mocks.createImageBitmap.mockReset().mockImplementation(() => {
    const bitmap = { width: mocks.imageWidth, height: mocks.imageHeight, close: vi.fn() }
    mocks.bitmaps.push(bitmap)
    return Promise.resolve(bitmap)
  })
  let objectUrlId = 0
  mocks.createObjectURL.mockReset().mockImplementation((file: File) => {
    objectUrlId++
    return `blob:${file.name}:${objectUrlId}`
  })
  mocks.revokeObjectURL.mockReset()
  vi.mocked(exportFile).mockReset()
  useUiStore.setState({ lastAction: null })
})

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
    expect(screen.getByText(/open an image or drop it on the preview/i)).toBeInTheDocument()
  })

  it('loads the first image from a native drop inside the preview', async () => {
    installImageMocks()
    renderTool(ImageTool)
    await waitFor(() => expect(mocks.dragHandler).not.toBeNull())

    await act(async () => {
      await mocks.dragHandler?.({
        payload: {
          type: 'drop',
          paths: ['/tmp/native.png', '/tmp/second.jpg'],
          position: { x: 300, y: 300 },
        },
      })
    })

    expect(mocks.scaleFactor).toHaveBeenCalled()
    expect(mocks.readFile).toHaveBeenCalledOnce()
    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/native.png')
    expect(screen.getByText('native.png')).toBeInTheDocument()
  })

  it('loads an image from the clipboard', async () => {
    installImageMocks()
    renderTool(ImageTool)

    // The tool listens on the document, because it has no focusable root.
    fireEvent.paste(document, {
      clipboardData: {
        files: [new File(['image'], 'clipboard.png', { type: 'image/png' })],
      },
    })

    await waitFor(() => expect(screen.getByText('clipboard.png')).toBeInTheDocument())
  })

  it('loads a PNG file with no MIME type', async () => {
    installImageMocks()
    renderTool(ImageTool)

    fireEvent.drop(screen.getByTestId('image-preview'), {
      dataTransfer: {
        files: [new File(['image'], 'no-type.png')],
      },
    })

    await waitFor(() => expect(screen.getByText('no-type.png')).toBeInTheDocument())
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Opened "no-type.png"',
      type: 'success',
    })
  })

  it('passes EXIF orientation handling to createImageBitmap', async () => {
    await loadMockImage()

    expect(mocks.createImageBitmap).toHaveBeenCalledWith(expect.any(File), {
      imageOrientation: 'from-image',
    })
  })

  it('releases the previous image when a new image loads', async () => {
    installImageMocks()
    const { unmount } = renderTool(ImageTool)
    const preview = screen.getByTestId('image-preview')

    fireEvent.drop(preview, {
      dataTransfer: { files: [new File(['first'], 'first.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText('first.png')).toBeInTheDocument())
    const firstBitmap = mocks.bitmaps[0]

    fireEvent.drop(preview, {
      dataTransfer: { files: [new File(['second'], 'second.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(screen.getByText('second.png')).toBeInTheDocument())

    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:first.png:1')
    expect(firstBitmap?.close).toHaveBeenCalledOnce()

    const secondBitmap = mocks.bitmaps[1]
    unmount()
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:second.png:2')
    expect(secondBitmap?.close).toHaveBeenCalledOnce()
  })

  it('keeps the newest image when an older decode finishes later', async () => {
    installImageMocks()
    const pendingDecodes: Array<(bitmap: ImageBitmap) => void> = []
    mocks.createImageBitmap.mockImplementation(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          pendingDecodes.push(resolve)
        })
    )
    const makeBitmap = () =>
      ({
        width: mocks.imageWidth,
        height: mocks.imageHeight,
        close: vi.fn(),
      }) as unknown as ImageBitmap

    renderTool(ImageTool)
    const preview = screen.getByTestId('image-preview')

    fireEvent.drop(preview, {
      dataTransfer: { files: [new File(['old'], 'old.png', { type: 'image/png' })] },
    })
    fireEvent.drop(preview, {
      dataTransfer: { files: [new File(['new'], 'new.png', { type: 'image/png' })] },
    })

    expect(pendingDecodes).toHaveLength(2)
    await act(async () => {
      pendingDecodes[1]?.(makeBitmap())
    })
    await waitFor(() => expect(screen.getByText('new.png')).toBeInTheDocument())
    await act(async () => {
      pendingDecodes[0]?.(makeBitmap())
    })

    expect(screen.getByText('new.png')).toBeInTheDocument()
    expect(screen.queryByText('old.png')).not.toBeInTheDocument()
  })

  it('restores an image from a saved source path', async () => {
    installImageMocks()
    useToolStateCache.setState({
      cache: new Map([
        [
          'image-tool',
          {
            sourcePath: '/tmp/saved.png',
            cropX: 0,
            cropY: 0,
            cropW: 100,
            cropH: 80,
          },
        ],
      ]),
    })

    render(<ImageTool />)

    await waitFor(() => expect(screen.getByText('saved.png')).toBeInTheDocument())
    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/saved.png')
  })

  it('asks for the image when restore fails', async () => {
    installImageMocks()
    mocks.readFile.mockRejectedValueOnce(new Error('missing file'))
    useToolStateCache.setState({
      cache: new Map([
        [
          'image-tool',
          {
            sourcePath: '/tmp/missing.png',
            cropX: 10,
            cropY: 10,
            cropW: 40,
            cropH: 40,
          },
        ],
      ]),
    })

    render(<ImageTool />)

    await waitFor(() =>
      expect(screen.getAllByText('Open the image again.').length).toBeGreaterThan(0)
    )
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Open the image again.',
      type: 'error',
    })
  })

  it('asks for the image when saved state has no source path', async () => {
    installImageMocks()
    useToolStateCache.setState({
      cache: new Map([
        [
          'image-tool',
          {
            sourcePath: null,
            cropX: 10,
            cropY: 10,
            cropW: 40,
            cropH: 40,
          },
        ],
      ]),
    })

    render(<ImageTool />)

    await waitFor(() =>
      expect(screen.getAllByText('Open the image again.').length).toBeGreaterThan(0)
    )
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Open the image again.',
      type: 'info',
    })
  })

  it('states that a GIF import uses one frame', async () => {
    installImageMocks()
    renderTool(ImageTool)

    fireEvent.drop(screen.getByTestId('image-preview'), {
      dataTransfer: { files: [new File(['gif'], 'motion.gif', { type: 'image/gif' })] },
    })

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Opened "motion.gif". GIF import uses the first frame only.',
        type: 'success',
      })
    )
  })

  it('rejects non-image drops with clear feedback', () => {
    renderTool(ImageTool)
    const preview = screen.getByTestId('image-preview')

    fireEvent.drop(preview, {
      dataTransfer: {
        files: [new File(['plain text'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'File is not an image',
      type: 'error',
    })
  })

  // ── Tab structure ────────────────────────────────────────────────

  it('renders all image operation tabs', () => {
    renderTool(ImageTool)
    expect(screen.getByText('Resize')).toBeInTheDocument()
    expect(screen.getByText('Crop')).toBeInTheDocument()
    expect(screen.getByText('Rotate & Flip')).toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Resize' })).toHaveAttribute(
      'aria-controls',
      'image-tool-sections-panel-resize'
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'image-tool-sections-tab-resize'
    )
  })

  it('rotates and flips an opened image', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Rotate & Flip'))

    fireEvent.click(screen.getByRole('button', { name: /rotate 90/i }))
    expect(screen.getByText(/Rotation: 90°/)).toBeInTheDocument()

    const horizontal = screen.getByRole('button', { name: /flip horizontally/i })
    fireEvent.click(horizontal)
    expect(horizontal).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps orientation on crop reset and clears it on reset all', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Rotate & Flip'))
    fireEvent.click(screen.getByRole('button', { name: /rotate 90/i }))
    fireEvent.click(screen.getByRole('button', { name: /flip horizontally/i }))

    fireEvent.click(screen.getByText('Crop'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width (px)' }), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByRole('button', { name: /reset to full image/i }))
    fireEvent.click(screen.getByText('Rotate & Flip'))
    expect(screen.getByText(/Rotation: 90°/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /flip horizontally/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText(/Rotation: 0°/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /flip horizontally/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  // ── Resize tab controls ──────────────────────────────────────────

  it('shows resize controls when clicking Resize tab', () => {
    renderTool(ImageTool)
    fireEvent.click(screen.getByText('Resize'))
    expect(screen.getByText(/open an image to get started/i)).toBeInTheDocument()
  })

  // ── Crop tab ─────────────────────────────────────────────────────

  it('shows the crop box with no enable toggle', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))

    expect(screen.getByTestId('crop-box')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /crop/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Image result')).not.toHaveClass('hidden')
  })

  it('resizes the crop from a focused corner handle', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    const handle = screen.getByRole('button', { name: 'Southeast crop handle' })
    handle.focus()
    expect(handle).toHaveFocus()

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })

    expect(screen.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(99)
  })

  it('stops crop dragging when mouse is released outside the preview', async () => {
    const preview = await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
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

  it('uses the crop size for the output canvas when resize is empty', async () => {
    mocks.imageWidth = 800
    mocks.imageHeight = 400
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width (px)' }), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Height (px)' }), {
      target: { value: '200' },
    })

    const canvas = screen.getByLabelText('Image result') as HTMLCanvasElement
    expect(canvas.width).toBe(200)
    expect(canvas.height).toBe(200)
  })

  it('resets the crop to the full image', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width (px)' }), {
      target: { value: '40' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset to full image' }))

    expect(screen.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(100)
    expect(screen.getByRole('spinbutton', { name: 'Height (px)' })).toHaveValue(80)
    expect(screen.getByRole('button', { name: 'Reset to full image' })).toBeDisabled()
  })

  it('compares resize output against the crop', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width (px)' }), {
      target: { value: '50' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Height (px)' }), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByText('Resize'))

    const width = screen.getByRole('spinbutton', { name: 'Width (px)' })
    const height = screen.getByRole('spinbutton', { name: 'Height (px)' })
    expect(width).toHaveAttribute('placeholder', '50')
    expect(height).toHaveAttribute('placeholder', '40')
    fireEvent.change(width, { target: { value: '25' } })

    expect(screen.getByText(/0\.25× crop pixels/)).toBeInTheDocument()
  })

  it('restores state that contains the removed crop key', () => {
    installImageMocks()
    useToolStateCache.setState({
      cache: new Map([
        [
          'image-tool',
          {
            activeTab: 'crop',
            cropEnabled: true,
          },
        ],
      ]),
    })

    render(<ImageTool />)

    expect(screen.getByRole('tab', { name: 'Crop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('switch', { name: /crop/i })).not.toBeInTheDocument()
  })

  it('undoes the last parameter change once', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Crop'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Width (px)' }), {
      target: { value: '40' },
    })

    const undo = screen.getByRole('button', { name: 'Undo last parameter change' })
    fireEvent.click(undo)

    expect(screen.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(100)
    expect(undo).toBeDisabled()
  })

  // ── Export tab ───────────────────────────────────────────────────

  it('switches to export tab', () => {
    renderTool(ImageTool)
    fireEvent.click(screen.getByText('Export'))
    expect(screen.getByText(/open an image to get started/i)).toBeInTheDocument()
  })

  it('disables export actions when the output is too large', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Resize'))
    const width = screen.getByRole('spinbutton', { name: 'Width (px)' })

    expect(width).toHaveAttribute('max', '16384')
    fireEvent.change(width, { target: { value: '16384' } })
    fireEvent.click(screen.getByText('Export'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download PNG/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Copy as PNG/i })).toBeDisabled()
    })
    expect(screen.getByText(/Export is disabled.*64,000,000px² limit/i)).toBeInTheDocument()
  })

  it('fills the JPEG background before it draws the image', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('tab', { name: 'JPEG' }))

    await waitFor(() => expect(mocks.canvasFillRect).toHaveBeenCalledWith(0, 0, 100, 80))
    expect(mocks.canvasFillRect.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.canvasDrawImage.mock.invocationCallOrder.at(-1)!
    )
    // The matte is a fixed white, not a theme colour, so the same source always
    // exports the same file.
    expect(screen.getByText(/White replaces transparency/i)).toBeInTheDocument()
  })

  it('names the quality slider and reports its percent value', async () => {
    await loadMockImage()
    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('tab', { name: 'WebP' }))

    const quality = screen.getByRole('slider', { name: 'Image quality' })
    expect(quality).toHaveAttribute('aria-valuetext', '85%')
    expect(screen.getByText(/Lossy · Modern/i)).toBeInTheDocument()
  })

  it('reports image export failures when canvas encoding returns no blob', async () => {
    await loadMockImage()
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value(callback: BlobCallback) {
        callback(null)
      },
    })

    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('button', { name: /Download PNG/i }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Image export failed',
        type: 'error',
      })
    )
  })

  it('reports synchronous canvas export failures', async () => {
    await loadMockImage()
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value() {
        throw new Error('canvas unavailable')
      },
    })

    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('button', { name: /Download PNG/i }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Image export failed',
        type: 'error',
      })
    )
  })

  it('saves through exportFile and reports success', async () => {
    vi.mocked(exportFile).mockResolvedValue('/tmp/sample.png')
    await loadMockImage()
    useUiStore.setState({ lastAction: null })

    fireEvent.click(screen.getByText('Export'))
    // The toolbar also shows the source name, so match the Export panel line.
    expect(screen.getByText(/^Filename:/)).toHaveTextContent('Filename: sample.png')
    fireEvent.click(screen.getByRole('button', { name: /Download PNG/i }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Saved PNG to "/tmp/sample.png" (5 B)',
        type: 'success',
      })
    )
    expect(exportFile).toHaveBeenCalledTimes(1)
    const [blob, filename] = vi.mocked(exportFile).mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toBe('sample.png')
  })

  it('reports when the save dialog is cancelled', async () => {
    vi.mocked(exportFile).mockResolvedValue(null)
    await loadMockImage()
    useUiStore.setState({ lastAction: null })

    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('button', { name: /Download PNG/i }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Save cancelled',
        type: 'info',
      })
    )
  })

  it('blocks a second download while the first encode runs', async () => {
    let finishEncode: BlobCallback | null = null
    await loadMockImage()
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: vi.fn((callback: BlobCallback) => {
        finishEncode = callback
      }),
    })

    fireEvent.click(screen.getByText('Export'))
    const download = screen.getByRole('button', { name: /Download PNG/i })
    fireEvent.click(download)
    fireEvent.click(download)

    expect(window.HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
    expect(download).toBeDisabled()
    act(() => finishEncode?.(null))
    await waitFor(() => expect(download).toBeEnabled())
  })

  it('reports a write failure from exportFile', async () => {
    vi.mocked(exportFile).mockRejectedValue(new Error('disk full'))
    await loadMockImage()

    fireEvent.click(screen.getByText('Export'))
    fireEvent.click(screen.getByRole('button', { name: /Download PNG/i }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Image export failed',
        type: 'error',
      })
    )
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
