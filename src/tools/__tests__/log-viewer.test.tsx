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
import { loadToolState } from '@/lib/db'
import { resetRecentFilesStore, useRecentLogsStore } from '@/stores/recent-files.store'
import { logReadResponse, utf8 } from '@/lib/__tests__/log-range-fixture'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ watch: vi.fn() }))
vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  loadToolState: vi.fn(),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn().mockResolvedValue([]),
  setSetting: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/file-io', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/file-io')>()),
  pickTextFilePath: vi.fn(),
}))

/** The files that the mocked `log_file_read` command reads. */
let files: Record<string, { bytes: Uint8Array; identity: bigint } | Error> = {}
let readCount = 0
let fireWatch: (() => void) | undefined
/** Holds each read until the test opens it. */
let gate: Promise<void> | null = null

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
  gate = null
  vi.clearAllMocks()
  vi.mocked(pickTextFilePath).mockReset()
  vi.mocked(loadToolState).mockResolvedValue(null)
  resetRecentFilesStore()
  useUiStore.setState({ lastAction: null })
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command !== 'log_file_read') return undefined
    const { path, start, maxBytes } = args as {
      path: string
      start: number | null
      maxBytes: number
    }
    readCount++
    if (gate) await gate
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
    // The read starts at the offset, less the bytes it takes again to check them.
    expect(invoke).toHaveBeenLastCalledWith('log_file_read', {
      path: '/tmp/app.log',
      start: 0,
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

  it('reads the new lines when the user resumes during a paused check', async () => {
    writeFile('/tmp/app.log', 'before\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('before\n'))

    fireEvent.click(screen.getByRole('button', { name: 'Pause live updates' }))
    writeFile('/tmp/app.log', 'before\nduring\n')
    let open = () => {}
    gate = new Promise((resolve) => (open = resolve))
    await change()
    // The check is in flight. Resume before it returns.
    fireEvent.click(screen.getByRole('button', { name: 'Resume live updates' }))
    gate = null
    open()

    await waitFor(() => expect(editor()).toHaveValue('before\nduring\n'))
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

  it('removes ANSI escapes from content without a path', () => {
    renderTool(LogViewer)
    act(() => {
      dispatchToolAction({ type: 'open-file', content: '\x1b[31mred\x1b[0m\n', filename: 'c.log' })
    })
    expect(editor()).toHaveValue('red\n')
  })

  it('filters lines by text, regex and level, and counts errors and warnings', async () => {
    writeFile('/tmp/app.log', 'INFO start\nERROR failed\n  at main.js:1\nWARN slow disk\nINFO done')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(screen.getByText(/1 error · 1 warning/)).toBeInTheDocument())

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter lines' }), {
      target: { value: 'disk' },
    })
    await waitFor(() => expect(editor()).toHaveValue('WARN slow disk'))
    expect(screen.getByText(/1 of 5 lines/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Error' }))
    await waitFor(() => expect(editor()).toHaveValue('ERROR failed\n  at main.js:1'))
    expect(screen.getByRole('button', { name: 'Error' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Regular expression' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter lines' }), {
      target: { value: '(' },
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid regex'))
  })

  it('shows appends in a filtered view', async () => {
    writeFile('/tmp/app.log', 'INFO a\nERROR b\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('INFO a\nERROR b\n'))
    fireEvent.click(screen.getByRole('button', { name: 'Error' }))
    await waitFor(() => expect(editor()).toHaveValue('ERROR b'))

    writeFile('/tmp/app.log', 'INFO a\nERROR b\nINFO c\nERROR d\n')
    await change()

    await waitFor(() => expect(editor()).toHaveValue('ERROR b\nERROR d'))
  })

  it('toggles word wrap', async () => {
    writeFile('/tmp/app.log', 'line')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('line'))

    const wrap = screen.getByRole('button', { name: /Wrap:/ })
    const before = wrap.getAttribute('aria-pressed')
    fireEvent.click(wrap)
    expect(wrap).not.toHaveAttribute('aria-pressed', before)
  })

  it('clears the view and then shows only new lines', async () => {
    writeFile('/tmp/app.log', 'old\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')
    await waitFor(() => expect(editor()).toHaveValue('old\n'))

    fireEvent.click(screen.getByRole('button', { name: 'Clear view' }))
    expect(editor()).toHaveValue('')
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'View cleared' })

    writeFile('/tmp/app.log', 'old\nnew\n')
    await change()
    await waitFor(() => expect(editor()).toHaveValue('new\n'))
  })

  it('shows the time since the last update', async () => {
    writeFile('/tmp/app.log', 'line\n')
    renderTool(LogViewer)
    openPath('/tmp/app.log')

    await waitFor(() => expect(screen.getByText(/updated 0 s ago/)).toBeInTheDocument())
  })

  it('reopens the log of the last session', async () => {
    writeFile('/tmp/app.log', 'kept\n')
    vi.mocked(loadToolState).mockResolvedValue({ path: '/tmp/app.log', wordWrap: true })
    renderTool(LogViewer)

    await waitFor(() => expect(editor()).toHaveValue('kept\n'))
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Reopened app.log' })
    expect(screen.getByRole('button', { name: /Wrap:/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports a last log that no longer exists and forgets it', async () => {
    vi.mocked(loadToolState).mockResolvedValue({ path: '/tmp/gone.log', wordWrap: null })
    renderTool(LogViewer)

    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toMatch(/^Could not reopen the last log: /)
    )
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()
  })

  it('lists opened logs in the recent logs menu', async () => {
    writeFile('/tmp/a.log', 'a')
    writeFile('/tmp/b.log', 'b')
    renderTool(LogViewer)
    openPath('/tmp/a.log')
    await waitFor(() => expect(editor()).toHaveValue('a'))
    openPath('/tmp/b.log')
    await waitFor(() => expect(editor()).toHaveValue('b'))
    await waitFor(() =>
      expect(useRecentLogsStore.getState().paths).toEqual(['/tmp/b.log', '/tmp/a.log'])
    )

    fireEvent.click(screen.getByRole('button', { name: 'Recent logs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open /tmp/a.log' }))
    await waitFor(() => expect(editor()).toHaveValue('a'))
  })

  it('removes a log that fails to open from the recent logs', async () => {
    // Load the empty stored list first, so the load does not replace the seeded list.
    await useRecentLogsStore.getState().load()
    useRecentLogsStore.setState({ paths: ['/tmp/missing.log'] })
    renderTool(LogViewer)
    openPath('/tmp/missing.log')

    await waitFor(() => expect(useRecentLogsStore.getState().paths).toEqual([]))
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
