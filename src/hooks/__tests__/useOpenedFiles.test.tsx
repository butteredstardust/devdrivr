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

/** Files the OS handed over at launch, plus what reading each one returns. */
function backendWith(files: Record<string, string>) {
  vi.mocked(invoke).mockImplementation((command, args) => {
    if (command === 'opened_files_take') return Promise.resolve(Object.keys(files))
    if (command === 'opened_file_read') {
      const path = (args as { path: string }).path
      const content = files[path]
      return content === undefined
        ? Promise.reject(new Error(`"${path}" was not opened by the system`))
        : Promise.resolve(content)
    }
    return Promise.resolve(undefined)
  })
}

let emitOpened: ((paths: string[]) => void) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  clearPendingToolActions()
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [], toasts: [] })
  emitOpened = undefined
  vi.mocked(listen).mockImplementation((_event, handler) => {
    emitOpened = (paths) => handler({ event: 'opened-files', id: 1, payload: paths })
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
    backendWith({})
    render(<Harness />)
    await vi.waitFor(() => expect(emitOpened).toBeDefined())

    vi.mocked(invoke).mockResolvedValue('# Notes')
    emitOpened?.(['/tmp/notes.md'])

    await vi.waitFor(() => expect(useUiStore.getState().activeTool).toBe('markdown-editor'))
  })

  it('reports a file it cannot read', async () => {
    backendWith({})
    render(<Harness />)
    await vi.waitFor(() => expect(emitOpened).toBeDefined())

    emitOpened?.(['/tmp/gone.json'])

    await vi.waitFor(() => {
      const toast = useUiStore.getState().toasts.at(-1)
      expect(toast?.type).toBe('error')
      expect(toast?.message).toContain('was not opened by the system')
    })
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })

  it('refuses a binary file rather than filling an editor with control codes', async () => {
    // A NUL byte is what `isLikelyBinaryText` looks for first.
    backendWith({ '/tmp/photo.json': 'PNG\u0000\u0001\u0002\u0003binary' })

    render(<Harness />)

    await vi.waitFor(() => {
      const toast = useUiStore.getState().toasts.at(-1)
      expect(toast?.message).toContain('Unsupported binary file')
    })
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })

  it('does nothing when there is no Tauri backend', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('no backend'))

    render(<Harness />)

    await Promise.resolve()
    expect(useUiStore.getState().tabs).toHaveLength(0)
  })
})
