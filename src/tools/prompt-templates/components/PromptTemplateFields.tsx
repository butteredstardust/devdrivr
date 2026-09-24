import { useId } from 'react'
import { Input, Select } from '@/components/shared/Input'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { TextArea } from '@/components/shared/TextArea'
import { tokenClass } from '@/tools/prompt-templates/prompt-templates-model'
import { tokenTone } from '@/tools/prompt-templates/template-utils'
import type { PromptTemplate, PromptTemplateValues } from '@/tools/prompt-templates/types'

type VariableFormProps = {
  template: PromptTemplate
  values: PromptTemplateValues
  onChange: (name: string, value: string) => void
}

export function VariableForm({ template, values, onChange }: VariableFormProps) {
  const fieldId = useId()
  if (template.variables.length === 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-muted)]">
        This template has no variables.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {template.variables.map((variable) => {
        // An explicit placeholder wins. Otherwise the example fills that job, because showing a
        // filled-in value is the clearest way to state the shape and detail a field wants.
        //
        // The aria-label on each input overrides the wrapping label, so the description reaches a
        // screen reader only through aria-describedby. A description is help text, not a name:
        // it must follow the name rather than replace it.
        const describedBy = variable.description ? `${fieldId}-${variable.name}` : undefined
        return (
          <label key={variable.name} className="block">
            <span className="mb-1 flex items-center gap-1 text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
              {variable.label}
              {variable.required && <span className="text-[var(--color-error)]">*</span>}
            </span>
            {variable.description && (
              <span id={describedBy} className="mb-1 block text-2xs text-[var(--color-text-muted)]">
                {variable.description}
              </span>
            )}
            {variable.type === 'select' ? (
              <Select
                value={values[variable.name] ?? ''}
                onChange={(event) => onChange(variable.name, event.target.value)}
                className="w-full"
                aria-label={variable.label}
                aria-describedby={describedBy}
              >
                {(variable.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : variable.type === 'textarea' ? (
              <TextArea
                value={values[variable.name] ?? ''}
                onChange={(event) => onChange(variable.name, event.target.value)}
                placeholder={variable.placeholder ?? variable.example}
                rows={variable.name === 'code' || variable.name === 'logs' ? 10 : 5}
                aria-label={variable.label}
                aria-describedby={describedBy}
                monospace
                className="min-h-24 resize-none"
              />
            ) : (
              <Input
                value={values[variable.name] ?? ''}
                onChange={(event) => onChange(variable.name, event.target.value)}
                placeholder={variable.placeholder ?? variable.example}
                monospace
                className="w-full"
                aria-label={variable.label}
                aria-describedby={describedBy}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}

type PreviewPaneProps = {
  renderedPrompt: string
  tokens: number
  missingVariables: string[]
}

export function PreviewPane({ renderedPrompt, tokens, missingVariables }: PreviewPaneProps) {
  const tone = tokenTone(tokens)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PaneHeader
        title="Preview"
        actions={
          <span className={`rounded border px-2 py-0.5 text-2xs tabular-nums ${tokenClass(tone)}`}>
            ~{tokens} tokens (chars/4 estimate)
          </span>
        }
      />
      {missingVariables.length > 0 && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
          Missing required: {missingVariables.join(', ')}
        </div>
      )}
      <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-[var(--color-text)]">
        {renderedPrompt || 'Fill variables to preview the rendered prompt.'}
      </pre>
    </div>
  )
}
