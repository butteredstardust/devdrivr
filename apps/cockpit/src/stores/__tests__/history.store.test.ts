import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useHistoryStore } from '../history.store'
import { loadHistory, addHistoryEntry, pruneHistory, clearAllHistory } from '@/lib/db'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/db', () => ({
  loadHistory: vi.fn(),
  addHistoryEntry: vi.fn(),
  pruneHistory: vi.fn(),
  clearAllHistory: vi.fn(),
}))

vi.mock('@/stores/ui.store', () => {
  const addToast = vi.fn()
  return {
    useUiStore: { getState: vi.fn(() => ({ addToast })) },
  }
})

beforeEach(() => {
  useHistoryStore.setState({ entries: [], initialized: false })
  ;(loadHistory as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(addHistoryEntry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(pruneHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(clearAllHistory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  vi.clearAllMocks()
})

describe('history store', () => {
  it('starts with empty entries and initialized: false', () => {
    const state = useHistoryStore.getState()
    expect(state.entries).toEqual([])
    expect(state.initialized).toBe(false)
  })

  it('add() creates entry with correct fields (id, tool, input, output, timestamp), calls addHistoryEntry and pruneHistory', async () => {
    await useHistoryStore.getState().add('tool-A', 'input-A', 'output-A')

    const { entries } = useHistoryStore.getState()
    expect(entries).toHaveLength(1)

    const entry = entries[0]!
    expect(entry.id).toBeTruthy()
    expect(entry.tool).toBe('tool-A')
    expect(entry.input).toBe('input-A')
    expect(entry.output).toBe('output-A')
    expect(entry.timestamp).toBeTypeOf('number')
    expect(entry.subTab).toBeUndefined()

    expect(addHistoryEntry).toHaveBeenCalledWith(entry)
    expect(pruneHistory).toHaveBeenCalledWith('tool-A', 500)
  })

  it('add() prepends entry to local state (newest first), caps local state at 200', async () => {
    const initialEntries = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      tool: 'test',
      input: 'in',
      output: 'out',
      timestamp: Date.now() - i * 1000,
    }))
    useHistoryStore.setState({ entries: initialEntries })

    await useHistoryStore.getState().add('new-tool', 'new-in', 'new-out')

    const { entries } = useHistoryStore.getState()
    expect(entries).toHaveLength(200)
    expect(entries[0]!.tool).toBe('new-tool')
    expect(entries[0]!.input).toBe('new-in')
    expect(entries[1]!.id).toBe('id-0')
  })

  it('add() includes subTab in entry only when provided', async () => {
    await useHistoryStore.getState().add('tool-B', 'in', 'out', 'my-subtab')

    const { entries } = useHistoryStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.subTab).toBe('my-subtab')
  })

  it('add() calls addToast on addHistoryEntry failure but still updates local state', async () => {
    ;(addHistoryEntry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB Error'))

    await useHistoryStore.getState().add('fail-tool', 'in', 'out')

    const { entries } = useHistoryStore.getState()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.tool).toBe('fail-tool')

    const { addToast } = useUiStore.getState()
    expect(addToast).toHaveBeenCalledWith('Failed to save history: DB Error', 'error')
  })

  it('loadForTool() calls loadHistory with the tool id and limit 100', async () => {
    ;(loadHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'loaded' }])

    const res = await useHistoryStore.getState().loadForTool('some-tool')

    expect(loadHistory).toHaveBeenCalledWith('some-tool', 100)
    expect(res).toEqual([{ id: 'loaded' }])
  })

  it('reload() calls loadHistory with undefined tool and limit 200, updates entries', async () => {
    const mockEntries = [{ id: '1', tool: 't1', input: 'i1', output: 'o1', timestamp: 123 }]
    ;(loadHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockEntries)

    await useHistoryStore.getState().reload()

    expect(loadHistory).toHaveBeenCalledWith(undefined, 200)
    expect(useHistoryStore.getState().entries).toEqual(mockEntries)
  })

  it('clearAll() calls clearAllHistory and resets entries to []', async () => {
    useHistoryStore.setState({
      entries: [{ id: '1', tool: 't1', input: 'i1', output: 'o1', timestamp: 123 }],
    })

    await useHistoryStore.getState().clearAll()

    expect(clearAllHistory).toHaveBeenCalledOnce()
    expect(useHistoryStore.getState().entries).toEqual([])
  })
})
