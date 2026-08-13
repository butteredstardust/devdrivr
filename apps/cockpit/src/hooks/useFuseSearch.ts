import { useEffect, useMemo, useRef, useState } from 'react'
import type Fuse from 'fuse.js'
import type { IFuseOptions } from 'fuse.js'

/**
 * Shared fuzzy-search primitive. Fuse.js is loaded lazily (it's only needed
 * once a user actually opens a search surface), so `search()` falls back to a
 * naive case-insensitive substring match — driven by `toSearchable` — until
 * the dynamic import resolves. This is the one place Fuse scoring lives;
 * CommandPalette and the sidebar filter both call this instead of each
 * keeping their own Fuse instance.
 *
 * `fuseOptions` and `toSearchable` should be stable references (module-level
 * or memoized) — they're dependencies of the effect that (re)builds the
 * index and of the returned `search` callback.
 */
export function useFuseSearch<T>(
  items: T[],
  fuseOptions: IFuseOptions<T>,
  toSearchable: (item: T) => Array<string | null | undefined>,
  enabled = true
): (query: string) => T[] {
  const fuseRef = useRef<Fuse<T> | null>(null)
  const [fuseReady, setFuseReady] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fuseRef.current = null
    setFuseReady(false)
    import('fuse.js').then(({ default: FuseClass }) => {
      if (cancelled) return
      fuseRef.current = new FuseClass(items, fuseOptions)
      setFuseReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, items, fuseOptions])

  return useMemo(() => {
    return (query: string): T[] => {
      const needle = query.trim()
      if (!needle) return items
      if (fuseRef.current) {
        return fuseRef.current.search(needle).map((r) => r.item)
      }
      const lower = needle.toLowerCase()
      return items.filter((item) =>
        toSearchable(item)
          .filter((v): v is string => v != null)
          .some((v) => v.toLowerCase().includes(lower))
      )
    }
    // fuseReady is read only to force a re-memo once the index finishes
    // loading — search() itself reads fuseRef.current fresh each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, toSearchable, fuseReady])
}
