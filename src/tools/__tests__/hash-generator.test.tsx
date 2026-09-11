import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { readFile, stat } from '@tauri-apps/plugin-fs'
import { renderTool } from './test-utils'
import HashGenerator from '../hash-generator/HashGenerator'

const mocks = vi.hoisted(() => ({
  eventHandler: null as ((event: { payload: Record<string, unknown> }) => void) | null,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(), stat: vi.fn() }))

describe('HashGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventHandler = null
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([1, 2, 3]))
    vi.mocked(stat).mockResolvedValue({ size: 3 } as Awaited<ReturnType<typeof stat>>)
    vi.mocked(getCurrentWebviewWindow).mockReturnValue({
      scaleFactor: vi.fn().mockResolvedValue(1),
      onDragDropEvent: vi.fn(async (handler) => {
        mocks.eventHandler = handler as typeof mocks.eventHandler
        return () => {
          mocks.eventHandler = null
        }
      }),
    } as unknown as ReturnType<typeof getCurrentWebviewWindow>)
  })

  it('renders input area', () => {
    renderTool(HashGenerator)
    expect(screen.getByPlaceholderText(/enter text to hash/i)).toBeInTheDocument()
  })

  it('shows hash values after typing', async () => {
    vi.useFakeTimers()
    renderTool(HashGenerator)
    const input = screen.getByPlaceholderText(/enter text to hash/i)
    fireEvent.change(input, { target: { value: 'test' } })
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await waitFor(() => {
      expect(screen.getByText('MD5')).toBeInTheDocument()
      expect(screen.getByText('SHA-256')).toBeInTheDocument()
    })
  })

  it('shows placeholder when input is empty', () => {
    renderTool(HashGenerator)
    expect(screen.getByText(/enter text above to see hashes/i)).toBeInTheDocument()
  })

  // Tauri claims the operating-system drop, so the React `onDrop` handler never fires on the
  // desktop. The tool answered "File drop is not supported by the active tool" without this path.
  it('takes a file dropped on the desktop window', async () => {
    renderTool(HashGenerator)
    fireEvent.click(screen.getByRole('radio', { name: 'File' }))
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    act(() => {
      mocks.eventHandler?.({
        payload: { type: 'drop', paths: ['/tmp/artefact.bin'], position: { x: 0, y: 0 } },
      })
    })

    await waitFor(() => expect(screen.getByText('artefact.bin')).toBeInTheDocument())
  })

  // A drop delivers bytes rather than a stream, so an unbounded drop would hold the whole file in
  // memory. The file picker keeps the chunked path.
  it('refuses a drop above the size cap', async () => {
    vi.mocked(stat).mockResolvedValue({ size: 600 * 1024 * 1024 } as Awaited<
      ReturnType<typeof stat>
    >)
    renderTool(HashGenerator)
    fireEvent.click(screen.getByRole('radio', { name: 'File' }))
    await waitFor(() => expect(mocks.eventHandler).not.toBeNull())

    act(() => {
      mocks.eventHandler?.({
        payload: { type: 'drop', paths: ['/tmp/huge.bin'], position: { x: 0, y: 0 } },
      })
    })

    await waitFor(() => expect(screen.getByText(/use Choose File instead/i)).toBeInTheDocument())
    expect(readFile).not.toHaveBeenCalled()
  })
})
