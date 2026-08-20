import { useEffect, useMemo, useRef, useState } from 'react'
import type Fuse from 'fuse.js'
import type { IFuseOptions } from 'fuse.js'

/** Inclusive `[start, end]` character offsets, as Fuse reports them. */
export type MatchRange = readonly [number, number]

export type SearchHit<T> = {
  item: T
  /** Ranges within the named key, or an empty array when the hit was scored on another key. */
  ranges: MatchRange[]
}

/**
 * Lazily builds and holds a Fuse index. Shared by the two public hooks below
 * so the dynamic-import dance exists once, not twice.
 */
function useFuseIndex<T>(
  items: T[],
  fuseOptions: IFuseOptions<T>,
  enabled: boolean
): { ref: React.RefObject<Fuse<T> | null>; ready: boolean } {
  const ref = useRef<Fuse<T> | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ref.current = null
    setReady(false)
    import('fuse.js').then(({ default: FuseClass }) => {
      if (cancelled) return
      ref.current = new FuseClass(items, fuseOptions)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, items, fuseOptions])

  return { ref, ready }
}

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
  const { ref: fuseRef, ready } = useFuseIndex(items, fuseOptions, enabled)

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
    // `ready` is read only to force a re-memo once the index finishes
    // loading — search() itself reads fuseRef.current fresh each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, toSearchable, ready])
}

/**
 * As {@link useFuseSearch}, but each hit also carries the character ranges
 * that matched within `highlightKey`.
 *
 * Separate from the plain hook rather than a wider return type on it, because
 * `includeMatches` makes Fuse do extra work per result and only one caller —
 * the sidebar filter, which renders the ranges — needs it.
 *
 * Ranges are reported for a single key on purpose. A hit scored on the
 * description is a real hit, but there is nothing to underline in the name,
 * and inventing a range there would point at characters that had no part in
 * the match.
 */
export function useFuseSearchWithMatches<T>(
  items: T[],
  fuseOptions: IFuseOptions<T>,
  toSearchable: (item: T) => Array<string | null | undefined>,
  highlightKey: string,
  enabled = true
): (query: string) => SearchHit<T>[] {
  const withMatches = useMemo(() => ({ ...fuseOptions, includeMatches: true }), [fuseOptions])
  const { ref: fuseRef, ready } = useFuseIndex(items, withMatches, enabled)

  return useMemo(() => {
    return (query: string): SearchHit<T>[] => {
      const needle = query.trim()
      if (!needle) return items.map((item) => ({ item, ranges: [] }))

      if (fuseRef.current) {
        return fuseRef.current.search(needle).map((result) => ({
          item: result.item,
          ranges: (result.matches ?? [])
            .filter((match) => match.key === highlightKey)
            .flatMap((match) => match.indices as unknown as MatchRange[]),
        }))
      }

      // Pre-Fuse fallback: the same substring filter the plain hook uses, with
      // the one range that substring occupies, so highlighting doesn't blink
      // on and then off as the index finishes loading.
      const lower = needle.toLowerCase()
      const hits: SearchHit<T>[] = []
      for (const item of items) {
        const fields = toSearchable(item).filter((v): v is string => v != null)
        if (!fields.some((v) => v.toLowerCase().includes(lower))) continue
        // Field order matches `toSearchable`, whose first entry is the name —
        // the same field `highlightKey` names for every current caller.
        const primary = fields[0] ?? ''
        const at = primary.toLowerCase().indexOf(lower)
        hits.push({ item, ranges: at === -1 ? [] : [[at, at + lower.length - 1]] })
      }
      return hits
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, toSearchable, highlightKey, ready])
}
