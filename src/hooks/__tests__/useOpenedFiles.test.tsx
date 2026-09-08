import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useOpenedFiles } from '@/hooks/useOpenedFiles'
import { claimPendingToolAction, clearPendingToolActions } from '@/lib/tool-actions'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  deleteToolState: vi.fn().mockResolvedValue(undefined),
}))

function Harness() {
  useOpenedFiles()
  return null
}

/**
 * Stands in for the Rust side: a queue that `opened_files_take` drains, and file content keyed by
 * path. Draining here removes the paths, exactly as the real command does.
 */
let queued: string[] = []
let files: Record<string, string> = {}
let takeCount = 0

function backendWith(contents: Record<string, string>) {
  files = contents
  queued = Object.keys(contents)
}

/** Fires the "the queue changed" event, after putting `paths` in the queue. */
let notifyOpened: (() => void) | undefined

function osOpens(paths: string[]) {
  queued.push(...paths)
  notifyOpened?.()
}

beforeEach(() => {
  vi.clearAllMocks()
  clearPendingToolActions()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [], toasts: [] })
  queued = []
  files = {}
  takeCount = 0
  notifyOpened = undefined

  vi.mocked(invoke).mockImplementation((command, args) => {
    if (command === 'opened_files_take') {
      takeCount++
      return Promise.resolve(queued.splice(0, queued.length))
    }
    if (command === 'opened_file_read') {
      const path = (args as { path: string }).path
      const content = files[path]
      return content === undefined
        ? Promise.reject(new Error(`"${path}" was not opened by the system`))
        : Promise.resolve(content)
    }
    return Promise.resolve(undefined)
  })

  vi.mocked(listen).mockImplementation((_event, handler) => {
    notifyOpened = () => handler({ event: 'opened-files', id: 1, payload: null })
    return Promise.resolve(() => {})
  })
})

describe('useOpenedFiles', () => {
  it('opens a file queued before the window existed', async () => {
    backendWith({ '/tmp/people.csv': 'a,b\n1,2\n' })

    render(<Harness />)

    await vi.waitFor(() => expect(useUiStore.getState().activeTool).toBe('csv-tools'))
    const tab = useUiStore.getState().tabs[0]!
    expect(claimPendingToolAction(tab.stateKey!)).toEqual({
      type: 'open-file',
      content: 'a,b\n1,2\n',
      filename: 'people.csv',
      path: '/tmp/people.csv',
    })
  })

  it('opens a file the OS sends while the app runs', async () => {
    render(<Harness />)
    await vi.waitFor(() => expect(notifyOpened).toBeDefined())

    files['/tmp/notes.md'] = '# Notes'
    osOpens(['/tmp/notes.md'])

    await vi.waitFor(() => expect(useUiStore.getState().activeTool).toBe('markdown-editor'))
  })

  it('opens a file only once when it is queued and announced', async () => {
    backendWith({ '/tmp/one.json': '{}' })

    render(<Harness />)
    await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(1))

    // The same arrival, announced after the startup drain already took it.
    const drains = takeCount
    notifyOpened?.()
    await vi.waitFor(() => expect(takeCount).toBeGreaterThan(drains))

    expect(useUiStore.getState().tabs).toHaveLength(1)
  })

  it('opens every file of a multiple selection', async () => {
    backendWith({ '/tmp/a.json': '{}', '/tmp/b.json': '[]' })

    render(<Harness />)

    // Two documents of one type, so two tabs of the tool rather than one overwritten by the other.
    await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
    const [first, second] = useUiStore.getState().tabs
    expect(claimPendingToolAction(first!.stateKey!)).toMatchObject({ filename: 'a.json' })
    expect(claimPendingToolAction(second!.stateKey!)).toMatchObject({ filename: 'b.json' })
  })

  it('reports a file it cannot read', async () => {
    render(<Harness />)
    await vi.waitFor(() => expect(notifyOpened).toBeDefined())

    osOpens(['/tmp/gone.json'])

    await vi.waitFor(() => {
      const toast = useUiStore.getState().toasts.at(-1)
      expect(toast?.type).toBe('error')
      expect(toast?.message).toContain('was not opened by the system')
    })
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })

  it('refuses a binary file rather than filling an editor with control codes', async () => {
    // A NUL byte is what `isLikelyBinaryText` looks for first.
    backendWith({ '/tmp/photo.json': 'PNG\u0000\u0001\u0002binary' })

    render(<Harness />)

    await vi.waitFor(() => {
      const toast = useUiStore.getState().toasts.at(-1)
      expect(toast?.message).toContain('Unsupported binary file')
    })
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })

  it('does nothing when there is no Tauri backend', async () => {
    vi.mocked(listen).mockRejectedValue(new Error('no backend'))

    render(<Harness />)

    await Promise.resolve()
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })
})
