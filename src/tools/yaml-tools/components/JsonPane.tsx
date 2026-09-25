import { useMemo } from 'react'
import { MonacoEditor as Editor } from '@/components/shared/MonacoEditor'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { documentsToJson, type YamlParse } from '@/tools/yaml-tools/yaml-helpers'

export function JsonPane({
  parsed,
  monacoTheme,
  monacoOptions,
  draft,
  onDraftChange,
  onApply,
}: {
  parsed: YamlParse
  monacoTheme: string
  monacoOptions: Record<string, unknown>
  /** `null` means "mirroring the YAML"; a string means the user took it over. */
  draft: string | null
  onDraftChange: (draft: string | null) => void
  onApply: (json: string) => void
}) {
  // Recompute conversion as input changes so the open pane always reflects valid source text.
  const json = useMemo(() => {
    if (parsed.status !== 'valid') return ''
    try {
      return documentsToJson(parsed.documents)
    } catch {
      return ''
    }
  }, [parsed])

  const value = draft ?? json

  const draftError = useMemo(() => {
    if (draft === null || !draft.trim()) return null
    try {
      JSON.parse(draft)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }, [draft])

  const canApply = draft !== null && draft.trim().length > 0 && draftError === null

  return (
    <>
      <PaneHeader
        title="JSON"
        actions={
          <>
            <CopyButton text={value} label="Copy JSON" />
            {draft !== null && (
              <>
                {/* Secondary: the toolbar's Format is the tool's primary. This row only appears
                    when a draft exists, so it doesn't need an accent to be found. */}
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    onApply(draft)
                    onDraftChange(null)
                  }}
                  disabled={!canApply}
                  title="Replace the YAML document with this JSON"
                >
                  Apply to YAML
                </Button>
                <Button variant="ghost" size="xs" onClick={() => onDraftChange(null)}>
                  Discard edits
                </Button>
                <span className="text-2xs text-[var(--color-text-muted)]">
                  {draftError ? `Invalid JSON — ${draftError}` : 'Edited — not applied'}
                </span>
              </>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          theme={monacoTheme}
          language="json"
          value={value}
          onChange={(next) => onDraftChange(next ?? '')}
          options={monacoOptions}
        />
      </div>
    </>
  )
}
