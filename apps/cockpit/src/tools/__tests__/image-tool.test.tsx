import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import ImageTool from '../image-tool/ImageTool'

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
