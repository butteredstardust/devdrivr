import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { XIcon } from '@phosphor-icons/react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { Alert } from '@/components/shared/Alert'
import { Button } from '@/components/shared/Button'
import { Checkbox } from '@/components/shared/Checkbox'
import { Field } from '@/components/shared/Field'
import { Input, Select } from '@/components/shared/Input'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TextArea } from '@/components/shared/TextArea'
import { useModalFocus } from '@/hooks/useModalFocus'
import { templateToDraft, type PromptTemplateDraft } from '@/lib/prompt-template-transfer'
import { CATEGORY_LABELS } from '@/tools/prompt-templates/builtin-templates'
import {
  joinList,
  OPTIMIZED_FOR_OPTIONS,
  splitList,
  VARIABLE_TYPE_OPTIONS,
} from '@/tools/prompt-templates/prompt-templates-model'
import { estimateTokens, syncVariablesToPrompt } from '@/tools/prompt-templates/template-utils'
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateVariableType,
} from '@/tools/prompt-templates/types'

type TemplateEditorModalProps = {
  mode: 'create' | 'edit' | 'duplicate'
  sourceTemplate?: PromptTemplate
  onClose: () => void
  onSave: (draft: PromptTemplateDraft) => Promise<void>
}

export function TemplateEditorModal({
  mode,
  sourceTemplate,
  onClose,
  onSave,
}: TemplateEditorModalProps) {
  const isInstanceActive = useIsInstanceActive()
  const titleId = useId()
  const [draft, setDraft] = useState<PromptTemplateDraft>(() => templateToDraft(sourceTemplate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const onSaveRef = useRef(onSave)
  const submitRef = useRef<(() => Promise<void>) | null>(null)

  onSaveRef.current = onSave

  const submit = useCallback(async () => {
    if (!draft.name.trim()) {
      setError('Name is required')
      return
    }
    if (!draft.prompt.trim()) {
      setError('Prompt body is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSaveRef.current({
        ...draft,
        estimatedTokens: estimateTokens(draft.prompt),
        variables: syncVariablesToPrompt(draft.prompt, draft.variables),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }, [draft])
  submitRef.current = submit

  // Same shared lifecycle as quick fill; Cmd+Enter to save is the one key this modal adds.
  const { panelRef, onKeyDown: onModalKeyDown } = useModalFocus<HTMLDivElement>({
    onClose,
    ...(firstInputRef ? { initialFocusRef: firstInputRef } : {}),
    enabled: isInstanceActive,
  })

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void submitRef.current?.()
        return
      }
      onModalKeyDown(event)
    },
    [onModalKeyDown]
  )

  const title =
    mode === 'edit'
      ? 'Edit Prompt Template'
      : mode === 'duplicate'
        ? 'Duplicate Template'
        : 'Create Template'

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
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-[var(--color-shadow)]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div>
            <h2 id={titleId} className="text-sm font-bold text-[var(--color-text)]">
              {title}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Use placeholders like {'{{code}}'}. Variables are synced automatically.
            </p>
          </div>
          <Button
            type="button"
            variant="icon"
            size="xs"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            aria-label="Close template editor"
          >
            <XIcon size={16} />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(22rem,0.8fr)_minmax(26rem,1fr)] overflow-hidden max-[900px]:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1fr)]">
          <div className="min-h-0 overflow-auto border-r border-[var(--color-border)] p-4">
            <div className="space-y-3">
              <Field label="Name">
                <Input
                  ref={firstInputRef}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full"
                  aria-label="Template name"
                />
              </Field>
              <Field label="Description">
                <TextArea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  aria-label="Template description"
                  className="resize-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <Select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category: event.target.value as PromptTemplateCategory,
                      }))
                    }
                    className="w-full"
                    aria-label="Template category"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Optimized For">
                  <Select
                    value={draft.optimizedFor}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        optimizedFor: event.target.value as PromptTemplate['optimizedFor'],
                      }))
                    }
                    className="w-full"
                    aria-label="Optimized for"
                  >
                    {OPTIMIZED_FOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Tags">
                <Input
                  value={joinList(draft.tags)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tags: splitList(event.target.value) }))
                  }
                  placeholder="testing, typescript, review"
                  className="w-full"
                  aria-label="Template tags"
                />
              </Field>
              <Field label="Tips">
                <Input
                  value={joinList(draft.tips)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tips: splitList(event.target.value) }))
                  }
                  placeholder="Include surrounding code, paste logs with timestamps"
                  className="w-full"
                  aria-label="Template tips"
                />
              </Field>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <label className="flex min-h-0 flex-1 flex-col">
              <SectionLabel className="border-b border-[var(--color-border)] px-4 py-2">
                Prompt Body
              </SectionLabel>
              <TextArea
                value={draft.prompt}
                onChange={(event) => {
                  const prompt = event.target.value
                  setDraft((current) => ({
                    ...current,
                    prompt,
                    variables: syncVariablesToPrompt(prompt, current.variables),
                    estimatedTokens: estimateTokens(prompt),
                  }))
                }}
                aria-label="Prompt body"
                monospace
                className="min-h-0 flex-1 resize-none rounded-none border-0 bg-[var(--color-bg)] p-4 focus:border-0"
              />
            </label>
            <div className="max-h-56 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <SectionLabel as="div" className="mb-2 justify-between">
                <span>Variables</span>
                <span>{draft.variables.length}</span>
              </SectionLabel>
              <div className="space-y-2">
                {draft.variables.map((variable) => (
                  <div
                    key={variable.name}
                    className="grid grid-cols-[1fr_7rem_5rem] items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2"
                  >
                    <div>
                      <div className="font-mono text-xs text-[var(--color-text)]">
                        {'{{'}
                        {variable.name}
                        {'}}'}
                      </div>
                      <Input
                        value={variable.label}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            variables: current.variables.map((item) =>
                              item.name === variable.name
                                ? { ...item, label: event.target.value }
                                : item
                            ),
                          }))
                        }
                        aria-label={`${variable.name} label`}
                        className="mt-1 w-full"
                      />
                    </div>
                    <Select
                      value={variable.type}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          variables: current.variables.map((item) =>
                            item.name === variable.name
                              ? {
                                  ...item,
                                  type: event.target.value as PromptTemplateVariableType,
                                  ...(event.target.value === 'select' &&
                                  (!item.options || item.options.length === 0)
                                    ? { options: ['Option'] }
                                    : {}),
                                }
                              : item
                          ),
                        }))
                      }
                      aria-label={`${variable.name} type`}
                    >
                      {VARIABLE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                    <label className="flex items-center justify-center gap-1 text-2xs text-[var(--color-text-muted)]">
                      <Checkbox
                        checked={variable.required ?? false}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            variables: current.variables.map((item) =>
                              item.name === variable.name
                                ? { ...item, required: event.target.checked }
                                : item
                            ),
                          }))
                        }
                      />
                      Req
                    </label>
                    {variable.type === 'select' && (
                      <Field label="Options" className="col-span-3">
                        <Input
                          value={joinList(variable.options ?? [])}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              variables: current.variables.map((item) =>
                                item.name === variable.name
                                  ? { ...item, options: splitList(event.target.value) }
                                  : item
                              ),
                            }))
                          }
                          placeholder="TypeScript, Python, Go"
                          aria-label={`${variable.name} options`}
                          className="w-full"
                        />
                      </Field>
                    )}
                  </div>
                ))}
                {draft.variables.length === 0 && (
                  <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
                    Add placeholders like {'{{context}}'} to create variables.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border)] px-4">
          <div>{error && <Alert variant="error">{error}</Alert>}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={() => void submit()} disabled={saving}>
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
