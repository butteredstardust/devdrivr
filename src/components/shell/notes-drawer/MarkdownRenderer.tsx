import { useEffect, useMemo, useState } from 'react'
import { processMarkdown } from '@/lib/markdown'
import { resolveNoteAssetMarkdown } from '@/lib/note-assets'

export function MarkdownRenderer({ content }: { content: string }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false
    void resolveNoteAssetMarkdown(content)
      .then(processMarkdown)
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('[MarkdownRenderer] Failed to process markdown:', error)
      })
    return () => {
      cancelled = true
    }
  }, [content])

  const htmlProp = useMemo(() => ({ __html: html }), [html])
  return (
    <div
      className="prose prose-xs max-w-none overflow-hidden text-xs text-[var(--color-text)]"
      dangerouslySetInnerHTML={htmlProp}
    />
  )
}
