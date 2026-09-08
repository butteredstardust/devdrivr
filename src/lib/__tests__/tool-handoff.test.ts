import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearHandoffDeliveries, sendToTool } from '@/lib/tool-handoff'
import { useUiStore } from '@/stores/ui.store'
import { useToolStateCache } from '@/stores/tool-state.store'
import { loadToolState, saveToolState } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  deleteToolState: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadToolState).mockResolvedValue(null)
  useUiStore.setState({ tabs: [], activeTabId: null, activeTool: '', tabMru: [] })
  useToolStateCache.setState({ cache: new Map(), seeds: new Map(), discarded: new Set() })
  clearHandoffDeliveries()
})

describe('sendToTool', () => {
  it('opens the target tool and seeds its state', async () => {
    sendToTool('api-client', { draft: { url: 'https://example.com' } })

    const { tabs, activeTool } = useUiStore.getState()
    expect(activeTool).toBe('api-client')
    // Focus is immediate; the seed waits on the tool's saved state.
    await vi.waitFor(() =>
      expect(useToolStateCache.getState().get(tabs[0]!.stateKey!)).toEqual({
        draft: { url: 'https://example.com' },
      })
    )
  })

  it('merges into whatever the target already had', () => {
    useToolStateCache.getState().set('json-tools', { input: 'old', activeTab: 'tree' })

    sendToTool('json-tools', { input: 'new' })

    expect(useToolStateCache.getState().get('json-tools')).toEqual({
      input: 'new',
      activeTab: 'tree',
    })
  })

  it('addresses the tab it focuses, not the bare tool id', async () => {
    // The tab holding the bare key is closed, leaving only a scoped one —
    // writing to `api-client` here would land in a row nobody reads.
    useUiStore.getState().openTab('api-client')
    const firstId = useUiStore.getState().tabs[0]!.id
    useUiStore.getState().openTabInstance('api-client')
    useUiStore.getState().closeTab(firstId)

    const survivor = useUiStore.getState().tabs[0]!
    expect(survivor.stateKey).toBe(`api-client#${survivor.id}`)

    sendToTool('api-client', { activeRequestId: null })

    await vi.waitFor(() =>
      expect(useToolStateCache.getState().get(survivor.stateKey!)).toEqual({
        activeRequestId: null,
      })
    )
    expect(useToolStateCache.getState().get('api-client')).toBeUndefined()
  })

  it('addresses the most recently used duplicate', () => {
    useUiStore.getState().openTab('json-tools')
    const first = useUiStore.getState().tabs[0]!
    useUiStore.getState().openTabInstance('json-tools')
    const second = useUiStore.getState().tabs[1]!
    useToolStateCache.getState().set(second.stateKey!, { input: 'second' })
    useUiStore.getState().openTab('base64')

    sendToTool('json-tools', { input: 'handoff' })

    expect(useUiStore.getState().activeTabId).toBe(second.id)
    expect(useToolStateCache.getState().get(second.stateKey!)).toEqual({ input: 'handoff' })
    expect(useToolStateCache.getState().get(first.stateKey!)).toBeUndefined()
  })

  it('bumps the seed counter, which is all a mounted destination watches', () => {
    useToolStateCache.getState().set('json-tools', { input: 'old' })

    sendToTool('json-tools', { input: 'new' })

    expect(useToolStateCache.getState().seeds.get('json-tools')).toBe(1)
  })

  it('keeps last session state the patch says nothing about', async () => {
    // The tool has no tab open, so its state is on disk rather than in the
    // cache. Seeding the patch alone would write defaults over the rest of it.
    vi.mocked(loadToolState).mockResolvedValue({ indent: 4, view: 'tree', input: 'stale' })

    sendToTool('json-tools', { input: 'from the api client' })
    await vi.waitFor(() =>
      expect(useToolStateCache.getState().get('json-tools')).toEqual({
        indent: 4,
        view: 'tree',
        input: 'from the api client',
      })
    )
  })

  it('still seeds the patch when the saved state cannot be read', async () => {
    vi.mocked(loadToolState).mockRejectedValue(new Error('db is gone'))

    sendToTool('json-tools', { input: 'x' })

    await vi.waitFor(() =>
      expect(useToolStateCache.getState().get('json-tools')).toEqual({ input: 'x' })
    )
    await vi.waitFor(() => expect(saveToolState).toHaveBeenCalledWith('json-tools', { input: 'x' }))
  })

  it('preserves live edits made while saved state is loading', async () => {
    let resolveLoad: (saved: Record<string, unknown> | null) => void = () => {}
    vi.mocked(loadToolState).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve
        })
    )

    sendToTool('json-tools', { input: 'handoff' })
    expect(useToolStateCache.getState().get('json-tools')).toEqual({ input: 'handoff' })

    // Mirrors useToolState's write-through when the newly focused tool is edited.
    useToolStateCache.getState().set('json-tools', { input: 'typed', view: 'tree' })
    resolveLoad({ input: 'stale', indent: 4 })

    await vi.waitFor(() =>
      expect(useToolStateCache.getState().get('json-tools')).toEqual({
        input: 'typed',
        indent: 4,
        view: 'tree',
      })
    )
    expect(saveToolState).toHaveBeenLastCalledWith('json-tools', {
      input: 'typed',
      indent: 4,
      view: 'tree',
    })
  })

  it('does not resurrect a duplicate state row closed during a saved-state read', async () => {
    let resolveLoad: (saved: Record<string, unknown> | null) => void = () => {}
    vi.mocked(loadToolState).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve
        })
    )
    useUiStore.getState().openTab('json-tools')
    useUiStore.getState().openTabInstance('json-tools')
    const duplicate = useUiStore.getState().tabs[1]!

    sendToTool('json-tools', { input: 'handoff' })
    useUiStore.getState().closeTab(duplicate.id)
    resolveLoad({ input: 'stale' })

    await Promise.resolve()
    await Promise.resolve()
    expect(useToolStateCache.getState().get(duplicate.stateKey!)).toBeUndefined()
    expect(saveToolState).not.toHaveBeenCalledWith(duplicate.stateKey, expect.anything())
  })

  it('does not open a second tab when the tool is already open', () => {
    useUiStore.getState().openTab('json-tools')

    sendToTool('json-tools', { input: 'x' })

    expect(useUiStore.getState().tabs).toHaveLength(1)
  })

  describe('documentKeys', () => {
    it('gives the handoff a new tab rather than replacing an open document', async () => {
      useUiStore.getState().openTab('yaml-tools')
      const occupied = useUiStore.getState().tabs[0]!
      useToolStateCache
        .getState()
        .set(occupied.stateKey!, { input: 'services:\n  web:\n', filePath: '/app/compose.yml' })

      sendToTool('yaml-tools', { input: '{"a":1}' }, { documentKeys: ['input'] })

      await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
      const arrival = useUiStore.getState().tabs[1]!
      expect(useToolStateCache.getState().get(arrival.stateKey!)).toEqual({ input: '{"a":1}' })
      // The document that was already there, and the path it would be saved to, are untouched.
      expect(useToolStateCache.getState().get(occupied.stateKey!)).toEqual({
        input: 'services:\n  web:\n',
        filePath: '/app/compose.yml',
      })
    })

    it('protects a document the destination has only on disk', async () => {
      // The destination has never been open this session, so the document it would lose is not in
      // the cache to be found.
      vi.mocked(loadToolState).mockResolvedValue({ input: 'saved work', filePath: '/a.json' })

      sendToTool('json-tools', { input: 'handoff' }, { documentKeys: ['input'] })

      await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
      const arrival = useUiStore.getState().tabs[1]!
      expect(useToolStateCache.getState().get(arrival.stateKey!)).toMatchObject({
        input: 'handoff',
      })
      expect(useToolStateCache.getState().get('json-tools')).toBeUndefined()
    })

    it('reuses the tab when the destination is empty', async () => {
      useUiStore.getState().openTab('json-tools')
      useToolStateCache.getState().set('json-tools', { input: '   ', view: 'tree' })

      sendToTool('json-tools', { input: 'handoff' }, { documentKeys: ['input'] })

      await vi.waitFor(() =>
        expect(useToolStateCache.getState().get('json-tools')).toEqual({
          input: 'handoff',
          view: 'tree',
        })
      )
      expect(useUiStore.getState().tabs).toHaveLength(1)
    })

    it('reuses the tab when the same document is sent twice', async () => {
      useUiStore.getState().openTab('json-tools')
      useToolStateCache.getState().set('json-tools', { input: 'same' })

      sendToTool('json-tools', { input: 'same' }, { documentKeys: ['input'] })

      await vi.waitFor(() => expect(useToolStateCache.getState().seeds.get('json-tools')).toBe(1))
      expect(useUiStore.getState().tabs).toHaveLength(1)
    })

    it('refills a tab it filled itself, so repeats do not pile up', async () => {
      useUiStore.getState().openTab('json-tools')
      useToolStateCache.getState().set('json-tools', { input: 'first' })

      // The first handoff moves aside for the document already there.
      sendToTool('json-tools', { input: 'second' }, { documentKeys: ['input'] })
      await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
      const arrival = useUiStore.getState().tabs[1]!

      // The second finds only its own output, which nobody has edited, and overwrites it.
      sendToTool('json-tools', { input: 'third' }, { documentKeys: ['input'] })
      await vi.waitFor(() =>
        expect(useToolStateCache.getState().get(arrival.stateKey!)).toMatchObject({
          input: 'third',
        })
      )
      expect(useUiStore.getState().tabs).toHaveLength(2)
    })

    it('moves aside once the user edits what a handoff delivered', async () => {
      useUiStore.getState().openTab('json-tools')
      useToolStateCache.getState().set('json-tools', { input: 'handed over' })
      sendToTool('json-tools', { input: 'handed over' }, { documentKeys: ['input'] })
      await vi.waitFor(() => expect(useToolStateCache.getState().seeds.get('json-tools')).toBe(1))

      useToolStateCache.getState().set('json-tools', { input: 'edited by hand' })
      sendToTool('json-tools', { input: 'next' }, { documentKeys: ['input'] })

      await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
      expect(useToolStateCache.getState().get('json-tools')).toEqual({ input: 'edited by hand' })
    })

    it('checks every document key it is given', async () => {
      useUiStore.getState().openTab('json-schema-validator')
      useToolStateCache.getState().set('json-schema-validator', { data: '', schema: '{"x":1}' })

      // `data` is empty, but `schema` holds work — one occupied key is enough.
      sendToTool(
        'json-schema-validator',
        { data: '[]', schema: '{"y":2}' },
        { documentKeys: ['data', 'schema'] }
      )

      await vi.waitFor(() => expect(useUiStore.getState().tabs).toHaveLength(2))
      expect(useToolStateCache.getState().get('json-schema-validator')).toEqual({
        data: '',
        schema: '{"x":1}',
      })
    })
  })
})
