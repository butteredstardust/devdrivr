import { Fragment, useMemo } from 'react'
import type { MatchRange } from '@/hooks/useFuseSearch'

type MatchTextProps = {
  text: string
  /** Inclusive `[start, end]` offsets into `text`, in any order, possibly overlapping. */
  ranges: MatchRange[]
}

/**
 * Renders `text` with the given character ranges emphasised.
 *
 * Built by slicing into real text nodes rather than by injecting markup: the
 * ranges come from a search index and the text from a tool registry, and
 * `dangerouslySetInnerHTML` would make the safety of that pairing a standing
 * obligation instead of a non-question.
 *
 * Ranges are normalised first — Fuse reports them per matched substring, in
 * match order, and adjacent or overlapping runs are common on short strings.
 * Sorting and merging keeps the output to one `<mark>` per visual run.
 */
export function MatchText({ text, ranges }: MatchTextProps) {
  const segments = useMemo(() => {
    if (ranges.length === 0) return null

    const merged: Array<[number, number]> = []
    const sorted = [...ranges]
      .map(
        ([start, end]) => [Math.max(0, start), Math.min(text.length - 1, end)] as [number, number]
      )
      .filter(([start, end]) => end >= start)
      .sort((a, b) => a[0] - b[0])

    for (const range of sorted) {
      const last = merged[merged.length - 1]
      // `+ 1` so runs that merely touch ("ab"+"cd") merge rather than
      // rendering as two marks with an invisible seam between them.
      if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1])
      else merged.push([...range])
    }
    if (merged.length === 0) return null

    const out: Array<{ text: string; match: boolean }> = []
    let cursor = 0
    for (const [start, end] of merged) {
      if (start > cursor) out.push({ text: text.slice(cursor, start), match: false })
      out.push({ text: text.slice(start, end + 1), match: true })
      cursor = end + 1
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), match: false })
    return out
  }, [text, ranges])

  if (!segments) return <>{text}</>

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          // Transparent background: the row underneath already changes fill on
          // hover and when active, and a filled mark on top of either turned
          // into a second, competing highlight.
          <mark key={index} className="bg-transparent font-semibold text-[var(--color-accent)]">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </>
  )
}
