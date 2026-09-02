import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { IFuseOptions } from 'fuse.js'
import { useFuseSearch, useFuseSearchWithMatches } from '@/hooks/useFuseSearch'

type Tool = { id: string; name: string; description: string }

const ITEMS: Tool[] = [
  { id: 'uuid', name: 'UUID Generator', description: 'Random identifiers' },
  { id: 'json', name: 'JSON Tools', description: 'Format and validate' },
  { id: 'diff', name: 'Diff Viewer', description: 'Compare two documents' },
]

// Module-level, as the hook's contract requires: these are effect dependencies,
// and a fresh object each render rebuilds the index on every keystroke.
const OPTIONS: IFuseOptions<Tool> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'description', weight: 1 },
  ],
  threshold: 0.4,
}

const toSearchable = (tool: Tool) => [tool.name, tool.description]

describe('useFuseSearch', () => {
  it('matches on a substring before the index has loaded', () => {
    const { result } = renderHook(() => useFuseSearch(ITEMS, OPTIONS, toSearchable))

    expect(result.current('uuid').map((t) => t.id)).toEqual(['uuid'])
  })

  it('returns everything for an empty query', () => {
    const { result } = renderHook(() => useFuseSearch(ITEMS, OPTIONS, toSearchable))

    expect(result.current('   ')).toEqual(ITEMS)
  })

  it('scores fuzzily once Fuse is in', async () => {
    const { result } = renderHook(() => useFuseSearch(ITEMS, OPTIONS, toSearchable))

    // A typo that no substring filter would ever match.
    await waitFor(() => expect(result.current('genrator').map((t) => t.id)).toEqual(['uuid']))
  })

  it('searches the other keys too, not just the name', () => {
    const { result } = renderHook(() => useFuseSearch(ITEMS, OPTIONS, toSearchable))

    expect(result.current('validate').map((t) => t.id)).toEqual(['json'])
  })

  it('does not build an index while disabled', async () => {
    const { result } = renderHook(() => useFuseSearch(ITEMS, OPTIONS, toSearchable, false))

    // Stays on the substring path indefinitely — the fuzzy query never lands.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current('genrator')).toEqual([])
  })
})

describe('useFuseSearchWithMatches', () => {
  it('reports the range the substring fallback matched', () => {
    const { result } = renderHook(() =>
      useFuseSearchWithMatches(ITEMS, OPTIONS, toSearchable, 'name')
    )

    expect(result.current('uuid')).toEqual([{ item: ITEMS[0], ranges: [[0, 3]] }])
  })

  it('reports ranges from Fuse once it has loaded', async () => {
    const { result } = renderHook(() =>
      useFuseSearchWithMatches(ITEMS, OPTIONS, toSearchable, 'name')
    )

    await waitFor(() => {
      const [hit] = result.current('json')
      expect(hit?.item.id).toBe('json')
      expect(hit?.ranges).toEqual([[0, 3]])
    })
  })

  it('leaves ranges empty when the hit was scored on another key', async () => {
    const { result } = renderHook(() =>
      useFuseSearchWithMatches(ITEMS, OPTIONS, toSearchable, 'name')
    )

    // "Compare" lives in the description; there is nothing to underline in
    // "Diff Viewer", and inventing a range there would be a lie.
    await waitFor(() => {
      const [hit] = result.current('compare')
      expect(hit?.item.id).toBe('diff')
      expect(hit?.ranges).toEqual([])
    })
  })

  it('carries every item with no ranges for an empty query', () => {
    const { result } = renderHook(() =>
      useFuseSearchWithMatches(ITEMS, OPTIONS, toSearchable, 'name')
    )

    expect(result.current('')).toEqual(ITEMS.map((item) => ({ item, ranges: [] })))
  })

  it('finds a match that is not at the start of the name', () => {
    const { result } = renderHook(() =>
      useFuseSearchWithMatches(ITEMS, OPTIONS, toSearchable, 'name')
    )

    expect(result.current('view')).toEqual([{ item: ITEMS[2], ranges: [[5, 8]] }])
  })
})
