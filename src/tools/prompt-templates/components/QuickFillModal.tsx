import { useCallback, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { XIcon } from '@phosphor-icons/react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { Button } from '@/components/shared/Button'
import { useModalFocus } from '@/hooks/useModalFocus'
import { VariableForm } from '@/tools/prompt-templates/components/PromptTemplateFields'
import { tokenClass } from '@/tools/prompt-templates/prompt-templates-model'
import { tokenTone } from '@/tools/prompt-templates/template-utils'
import type { PromptTemplate, PromptTemplateValues } from '@/tools/prompt-templates/types'

type QuickFillModalProps = {
  open: boolean
  template: PromptTemplate
  values: PromptTemplateValues
  renderedPrompt: string
  tokens: number
  missingVariables: string[]
  onChange: (name: string, value: string) => void
  onClose: () => void
  onCopy: () => void
}

export function QuickFillModal({
  open,
  template,
  values,
  renderedPrompt,
  tokens,
  missingVariables,
  onChange,
  onClose,
  onCopy,
}: QuickFillModalProps) {
  const isInstanceActive = useIsInstanceActive()
  const titleId = useId()
  const fieldRootRef = useRef<HTMLDivElement>(null)
  const onCopyRef = useRef(onCopy)
  onCopyRef.current = onCopy

  // Escape, Tab trapping and focus restore come from the shared modal lifecycle; only the two
  // shortcuts that are particular to quick fill live here.
  const { panelRef, onKeyDown: onModalKeyDown } = useModalFocus<HTMLDivElement>({
    onClose,
    initialFocusSelector: 'input, textarea, select',
    enabled: isInstanceActive && open,
  })

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const shortcut = event.metaKey || event.ctrlKey
      if (shortcut && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fieldRootRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
        return
      }
      if (shortcut && event.key === 'Enter') {
        event.preventDefault()
        onCopyRef.current()
        return
      }
      onModalKeyDown(event)
    },
    [onModalKeyDown]
  )

  if (!open) return null

  const tone = tokenTone(tokens)

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-scrim)' }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="grid max-h-[88vh] w-full max-w-5xl grid-cols-[minmax(20rem,0.85fr)_minmax(24rem,1fr)] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-[var(--color-shadow)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[minmax(0,1fr)_minmax(10rem,0.75fr)]"
      >
        <div className="flex min-h-0 flex-col border-r border-[var(--color-border)] max-[900px]:border-b max-[900px]:border-r-0">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
            <div>
              <h2 id={titleId} className="text-sm font-bold text-[var(--color-text)]">
                {template.name}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Fill variables, then press Cmd+Enter to copy.
              </p>
            </div>
            <Button
              type="button"
              variant="icon"
              size="xs"
              onClick={onClose}
              className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              aria-label="Close quick fill"
            >
              <XIcon size={16} />
            </Button>
          </div>
          <div ref={fieldRootRef} className="min-h-0 flex-1 overflow-auto p-4">
            <VariableForm template={template} values={values} onChange={onChange} />
          </div>
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border)] px-4">
            <span
              className={`rounded border px-2 py-0.5 text-2xs tabular-nums ${tokenClass(tone)}`}
            >
              ~{tokens} tokens (chars/4 estimate)
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={onCopy}>
                Copy to Clipboard
              </Button>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          {missingVariables.length > 0 && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
              Missing required: {missingVariables.join(', ')}
            </div>
          )}
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-[var(--color-text)]">
            {renderedPrompt}
          </pre>
        </div>
      </div>
    </div>
  )
}
