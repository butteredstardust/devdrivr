import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { watch } from '@tauri-apps/plugin-fs'
import { renderTool } from './test-utils'
import LogViewer from '@/tools/log-viewer/LogViewer'
import { dispatchToolAction } from '@/lib/tool-actions'
import { pickTextFilePath } from '@/lib/file-io'
import { MAX_LOG_VIEW_CHARACTERS } from '@/lib/log-viewer'
import { useUiStore } from '@/stores/ui.store'
import { logReadResponse, utf8 } from '@/lib/__tests__/log-range-fixture'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ watch: vi.fn() }))
vi.mock('@/lib/file-io', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/file-io')>()),
  pickTextFilePath: vi.fn(),
}))

/** The files that the mocked `log_file_read` command reads. */
let files: Record<string, { bytes: Uint8Array; identity: bigint } | Error> = {}
let readCount = 0
let fireWatch: (() => void) | undefined

function writeFile(path: string, text: string | Uint8Array, identity = 1n) {
  files[path] = { bytes: typeof text === 'string' ? utf8(text) : text, identity }
}

/** Signals a change, as the filesystem watch does, and waits for the read. */
async function change() {
  const before = readCount
  act(() => fireWatch?.())
  await waitFor(() => expect(readCount).toBeGreaterThan(before))
}

function openPath(path: string) {
  act(() => {
    dispatchToolAction({ type: 'open-file', content: '', filename: 'ignored', path })
  })
}

const editor = () => screen.getByTestId('monaco-editor')

beforeEach(() => {
  files = {}
  readCount = 0
  fireWatch = undefined
  vi.clearAllMocks()
  vi.mocked(pickTextFilePath).mockReset()
  useUiStore.setState({ lastAction: null })
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command !== 'log_file_read') return undefined
    const { path, start, maxBytes } = args as {
      path: string
      start: number | null
      maxBytes: number
    }
    readCount++
    const file = files[path]
    if (!file) throw new Error(`"${path}" does not exist`)
    if (file instanceof Error) throw file
    return logReadResponse(file.bytes, start, maxBytes, file.identity)
  })
  vi.mocked(watch).mockImplementation(async (_path, callback) => {
    fireWatch = () => callback({ type: 'any', paths: [], attrs: {} } as never)
    return () => {}
  })
})

describe('LogViewer', () => {
  it('starts with an accessible empty state', () => {
    renderTool(LogViewer)

    expect(screen.getAllByText('No log open')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Open log' })).toHaveLength(2)
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('reads a log from its path and exposes live status', async () => {
    writeFile('/tmp/app.log', 'first\nsecond')
    renderTool(LogViewer)

    openPath('/tmp/app.log')

    await waitFor(() => expect(editor()).toHaveValue('first\nsecond'))
    expect(editor()).toHaveAttribute('readonly')
    expect(screen.getByText('app.log')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText(/2 lines · 12 characters/)).toBeInTheDocument()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened app.log' })
  })

  it('opens content without a path and does not read the disk', () => {
    renderTool(LogViewer)

    act(() => {
      dispatchToolAction({ type: 'open-file', content: 'a\r\nb', filename: 'drop.log' })
    })

    expect(editor()).toHaveValue('a\nb')
    expect(invoke).not.toHaveBeenCalledWith('log_file_read', expect.anything())
  })

  it('appends only the bytes that a writer adds', async () => {
    writeFile('/tmp/app.log', 'one\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('one\n'))

    writeFile('/tmp/app.log', 'one\ntwo\n')
    await change()

    await waitFor(() => expect(editor()).toHaveValue('one\ntwo\n'))
    expect(invoke).toHaveBeenLastCalledWith('log_file_read', {
      path: '/tmp/app.log',
      start: 4,
      maxBytes: expect.any(Number),
    })
  })

  it('shows the new file after the log rotates', async () => {
    writeFile('/tmp/app.log', 'old line one\nold line two\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('old line one\nold line two\n'))

    writeFile('/tmp/app.log', 'new\n', 2n)
    await change()

    await waitFor(() => expect(editor()).toHaveValue('new\n'))
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Log rotated: app.log' })
  })

  it('shows the tail of a log that is larger than one read', async () => {
    writeFile('/tmp/large.log', `discarded\n${'x'.repeat(MAX_LOG_VIEW_CHARACTERS)}\nend\n`)
    renderTool(LogViewer)
    openPath('/tmp/large.log')

    await waitFor(() => expect(screen.getByText(/showing tail/)).toBeInTheDocument())
    expect((editor() as HTMLTextAreaElement).value.endsWith('\nend\n')).toBe(true)
    expect((editor() as HTMLTextAreaElement).value).not.toContain('discarded')
  })

  it('decodes a UTF-16 log and names the encoding', async () => {
    writeFile('/tmp/win.log', new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]))
    renderTool(LogViewer)
    openPath('/tmp/win.log')

    await waitFor(() => expect(editor()).toHaveValue('hi'))
    expect(screen.getByText(/UTF-16 LE/)).toBeInTheDocument()
  })

  it('waits while paused and reads everything on resume', async () => {
    writeFile('/tmp/app.log', 'before\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('before\n'))

    fireEvent.click(screen.getByRole('button', { name: 'Pause live updates' }))
    writeFile('/tmp/app.log', 'before\nduring\n')
    await change()

    await waitFor(() => expect(screen.getByText(/update waiting/)).toBeInTheDocument())
    expect(editor()).toHaveValue('before\n')
    expect(screen.getByText('Paused')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume live updates' }))

    await waitFor(() => expect(editor()).toHaveValue('before\nduring\n'))
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.queryByText(/update waiting/)).not.toBeInTheDocument()
  })

  it('marks live reload as stopped after a read fails, and recovers', async () => {
    writeFile('/tmp/app.log', 'before\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('before\n'))

    files['/tmp/app.log'] = new Error('permission denied')
    await change()
    await waitFor(() => expect(screen.getByText('Stopped')).toBeInTheDocument())
    expect(screen.getByText(/reload stopped/)).toBeInTheDocument()

    writeFile('/tmp/app.log', 'before\nafter\n')
    await change()
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument())
    expect(editor()).toHaveValue('before\nafter\n')
  })

  it('reports a first read that fails and closes the log', async () => {
    renderTool(LogViewer)
    openPath('/tmp/missing.log')

    await waitFor(() => expect(useUiStore.getState().lastAction?.message).toMatch(/^Open failed: /))
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('refuses a binary file', async () => {
    writeFile('/tmp/core.bin', new Uint8Array([0x7f, 0x45, 0x00, 0x00, 0x01]))
    renderTool(LogViewer)
    openPath('/tmp/core.bin')

    await waitFor(() =>
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Unsupported binary file: core.bin',
      })
    )
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('opens a selected path from its toolbar action', async () => {
    writeFile('/tmp/service.log', 'toolbar open')
    vi.mocked(pickTextFilePath).mockResolvedValue('/tmp/service.log')
    renderTool(LogViewer)

    fireEvent.click(screen.getAllByRole('button', { name: 'Open log' })[0]!)

    await waitFor(() => expect(editor()).toHaveValue('toolbar open'))
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened service.log' })
  })
})
