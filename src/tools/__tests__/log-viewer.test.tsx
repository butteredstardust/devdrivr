import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderTool } from './test-utils'
import LogViewer from '@/tools/log-viewer/LogViewer'
import { dispatchToolAction } from '@/lib/tool-actions'
import { openFileDialog } from '@/lib/file-io'
import type { ReloadedTextFile } from '@/hooks/useReloadOnFileChange'
import { useUiStore } from '@/stores/ui.store'
import { MAX_LOG_FILE_BYTES, MAX_LOG_VIEW_CHARACTERS } from '@/lib/log-viewer'

type WatchOptions = {
  filePath: string | null
  getContent: () => string
  onReload: (file: ReloadedTextFile) => void
  onError?: (message: string) => void
}

let watchOptions: WatchOptions | undefined

vi.mock('@/hooks/useReloadOnFileChange', () => ({
  useReloadOnFileChange: (options: WatchOptions) => {
    watchOptions = options
  },
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn(),
}))

beforeEach(() => {
  watchOptions = undefined
  vi.mocked(openFileDialog).mockReset()
  useUiStore.setState({ lastAction: null })
})

describe('LogViewer', () => {
  it('starts with an accessible empty state', () => {
    renderTool(LogViewer)

    expect(screen.getAllByText('No log open')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Open log' })).toHaveLength(2)
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('opens a log as read-only text and exposes live status', () => {
    renderTool(LogViewer)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'first\nsecond',
        filename: 'app.log',
        path: '/tmp/app.log',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('first\nsecond')
    expect(screen.getByTestId('monaco-editor')).toHaveAttribute('readonly')
    expect(screen.getByText('app.log')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText(/2 lines · 12 characters/)).toBeInTheDocument()
    expect(watchOptions?.filePath).toBe('/tmp/app.log')
  })

  it('queues the newest disk update while paused and applies it on resume', () => {
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'before',
        filename: 'app.log',
        path: '/tmp/app.log',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pause live updates' }))
    act(() => {
      watchOptions?.onReload({ content: 'after', filename: 'app.log', path: '/tmp/app.log' })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('before')
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getByText(/update waiting/)).toBeInTheDocument()
    expect(watchOptions?.getContent()).toBe('after')

    // A second update can even restore the text currently on screen. The watcher must compare
    // against the queued snapshot or Resume would incorrectly apply the stale first update.
    act(() => {
      watchOptions?.onReload({ content: 'before', filename: 'app.log', path: '/tmp/app.log' })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Resume live updates' }))

    expect(screen.getByTestId('monaco-editor')).toHaveValue('before')
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Reloaded app.log from disk',
    })
  })

  it('applies disk updates immediately while live', () => {
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'before',
        filename: 'app.log',
        path: '/tmp/app.log',
      })
      watchOptions?.onReload({ content: 'after', filename: 'app.log', path: '/tmp/app.log' })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('after')
  })

  it('renders a bounded tail window for a large log', () => {
    const oversizedView = `discarded\n${'x'.repeat(MAX_LOG_VIEW_CHARACTERS)}`
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: oversizedView,
        filename: 'large.log',
        path: '/tmp/large.log',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('x'.repeat(MAX_LOG_VIEW_CHARACTERS))
    expect(screen.getByText(/showing tail/)).toBeInTheDocument()
  })

  it('keeps the full bounded tail when a long final line ends at a newline', () => {
    const longLine = `${'x'.repeat(MAX_LOG_VIEW_CHARACTERS)}\n`
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: longLine,
        filename: 'large.log',
        path: '/tmp/large.log',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue(
      longLine.slice(-MAX_LOG_VIEW_CHARACTERS)
    )
  })

  it('marks live reload as stopped after a bounded read fails', () => {
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'before',
        filename: 'app.log',
        path: '/tmp/app.log',
      })
    })
    act(() => watchOptions?.onError?.('File is too large'))

    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText(/reload stopped/)).toBeInTheDocument()
  })

  it('opens a selected file from its toolbar action', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: 'toolbar open',
      filename: 'service.log',
      path: '/tmp/service.log',
    })
    renderTool(LogViewer)

    fireEvent.click(screen.getAllByRole('button', { name: 'Open log' })[0]!)

    expect(await screen.findByTestId('monaco-editor')).toHaveValue('toolbar open')
    expect(openFileDialog).toHaveBeenCalledWith({ maxBytes: MAX_LOG_FILE_BYTES })
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened service.log' })
  })
})
