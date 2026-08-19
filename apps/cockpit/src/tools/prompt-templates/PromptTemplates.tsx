import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  CopyIcon,
  ChatCircleTextIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Alert } from '@/components/shared/Alert'
import { Input, Select } from '@/components/shared/Input'
import { TextArea } from '@/components/shared/TextArea'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TabBar } from '@/components/shared/TabBar'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useIsInstanceActive } from '@/app/tool-instance'
import { buildExportFilename, exportFile, openFileDialog } from '@/lib/file-io'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import {
  BUILTIN_PROMPT_TEMPLATES,
  CATEGORY_LABELS,
} from '@/tools/prompt-templates/builtin-templates'
import {
  parsePromptTemplateImport,
  serializePromptTemplateExport,
} from '@/tools/prompt-templates/template-import'
import {
  estimateTokens,
  mergeDefaultValues,
  missingRequiredVariables,
  renderPrompt,
  syncVariablesToPrompt,
  templateSearchText,
  templateToDraft,
  tokenTone,
  type PromptTemplateDraft,
} from '@/tools/prompt-templates/template-utils'
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateVariableType,
  PromptTemplateValues,
  TokenTone,
} from '@/tools/prompt-templates/types'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { SearchInput } from '@/components/shared/SearchInput'

type CategoryFilter = PromptTemplateCategory | 'all'

type PromptTemplatesState = {
  search: string
  category: CategoryFilter
  selectedId: string
  inputsByTemplate: Record<string, PromptTemplateValues>
}

const DEFAULT_STATE: PromptTemplatesState = {
  search: '',
  category: 'all',
  selectedId: BUILTIN_PROMPT_TEMPLATES[0]?.id ?? '',
  inputsByTemplate: {},
}

const FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id: id as PromptTemplateCategory,
    label,
  })),
]

function tokenClass(tone: TokenTone): string {
  if (tone === 'error') return 'border-[var(--color-error)] text-[var(--color-error)]'
  if (tone === 'warning') return 'border-[var(--color-warning)] text-[var(--color-warning)]'
  return 'border-[var(--color-success)] text-[var(--color-success)]'
}

function categoryCount(category: CategoryFilter, templates: PromptTemplate[]): number {
  if (category === 'all') return templates.length
  return templates.filter((template) => template.category === category).length
}

function shouldIgnoreGlobalEnter(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as Element & { isContentEditable?: boolean }
  if (element.isContentEditable) return true
  return typeof element.closest === 'function'
    ? element.closest('input, textarea, select, button, a, [role="button"]') !== null
    : false
}

function getTemplateById(id: string, templates: PromptTemplate[]): PromptTemplate {
  const fallbackTemplate = templates[0]
  if (!fallbackTemplate) {
    throw new Error('No prompt templates configured')
  }
  return templates.find((template) => template.id === id) ?? fallbackTemplate
}

type VariableFormProps = {
  template: PromptTemplate
  values: PromptTemplateValues
  onChange: (name: string, value: string) => void
}

function VariableForm({ template, values, onChange }: VariableFormProps) {
  if (template.variables.length === 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-muted)]">
        This template has no variables.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {template.variables.map((variable) => (
        <label key={variable.name} className="block">
          <span className="mb-1 flex items-center gap-1 font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
            {variable.label}
            {variable.required && <span className="text-[var(--color-error)]">*</span>}
          </span>
          {variable.type === 'select' ? (
            <Select
              value={values[variable.name] ?? ''}
              onChange={(event) => onChange(variable.name, event.target.value)}
              className="w-full"
              aria-label={variable.label}
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
              placeholder={variable.placeholder}
              rows={variable.name === 'code' || variable.name === 'logs' ? 10 : 5}
              aria-label={variable.label}
              className="min-h-24 resize-none"
            />
          ) : (
            <Input
              value={values[variable.name] ?? ''}
              onChange={(event) => onChange(variable.name, event.target.value)}
              placeholder={variable.placeholder}
              className="w-full"
              aria-label={variable.label}
            />
          )}
        </label>
      ))}
    </div>
  )
}

type PreviewPaneProps = {
  renderedPrompt: string
  tokens: number
  missingVariables: string[]
}

function PreviewPane({ renderedPrompt, tokens, missingVariables }: PreviewPaneProps) {
  const tone = tokenTone(tokens)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 font-mono text-2xs text-[var(--color-text-muted)]">
        <span>[ 03-PREVIEW ]</span>
        <span className={`rounded border px-2 py-0.5 ${tokenClass(tone)}`}>~{tokens} TOKENS</span>
      </div>
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

function QuickFillModal({
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
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const onCopyRef = useRef(onCopy)

  onCloseRef.current = onClose
  onCopyRef.current = onCopy

  useEffect(() => {
    if (!open) return
    const previousActive =
      document.activeElement && 'focus' in document.activeElement
        ? (document.activeElement as { focus: () => void })
        : null
    const focusTimer = setTimeout(() => {
      fieldRootRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
    }, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          modalRef.current?.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => !element.hasAttribute('disabled'))
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) {
          event.preventDefault()
          return
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        } else if (!modalRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          first.focus()
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        fieldRootRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        onCopyRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      previousActive?.focus()
    }
  }, [isInstanceActive, open])

  if (!open) return null

  const tone = tokenTone(tokens)

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--color-scrim)' }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
            <span className={`rounded border px-2 py-0.5 font-mono text-2xs ${tokenClass(tone)}`}>
              ~{tokens} tokens
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

type TemplateEditorModalProps = {
  mode: 'create' | 'edit' | 'duplicate'
  sourceTemplate?: PromptTemplate
  onClose: () => void
  onSave: (draft: PromptTemplateDraft) => Promise<void>
}

const OPTIMIZED_FOR_OPTIONS: PromptTemplate['optimizedFor'][] = [
  'Claude',
  'ChatGPT',
  'Cursor',
  'Generic',
]

const VARIABLE_TYPE_OPTIONS: PromptTemplateVariableType[] = ['text', 'textarea', 'select']

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinList(value: string[]): string {
  return value.join(', ')
}

function TemplateEditorModal({ mode, sourceTemplate, onClose, onSave }: TemplateEditorModalProps) {
  const isInstanceActive = useIsInstanceActive()
  const titleId = useId()
  const [draft, setDraft] = useState<PromptTemplateDraft>(() => templateToDraft(sourceTemplate))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const onSaveRef = useRef(onSave)
  const submitRef = useRef<(() => Promise<void>) | null>(null)

  onCloseRef.current = onClose
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

  useEffect(() => {
    const previousActive =
      document.activeElement && 'focus' in document.activeElement
        ? (document.activeElement as { focus: () => void })
        : null
    const focusTimer = setTimeout(() => firstInputRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void submitRef.current?.()
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          modalRef.current?.querySelectorAll<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => !element.hasAttribute('disabled'))
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) {
          event.preventDefault()
          return
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        } else if (!modalRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      previousActive?.focus()
    }
  }, [isInstanceActive])

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
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
              <label className="block">
                <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                  Name
                </span>
                <Input
                  ref={firstInputRef}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full"
                  aria-label="Template name"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                  Description
                </span>
                <TextArea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  aria-label="Template description"
                  className="resize-none"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                    Category
                  </span>
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
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                    Optimized For
                  </span>
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
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                  Tags
                </span>
                <Input
                  value={joinList(draft.tags)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tags: splitList(event.target.value) }))
                  }
                  placeholder="testing, typescript, review"
                  className="w-full"
                  aria-label="Template tags"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                  Tips
                </span>
                <Input
                  value={joinList(draft.tips)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tips: splitList(event.target.value) }))
                  }
                  placeholder="Include surrounding code, paste logs with timestamps"
                  className="w-full"
                  aria-label="Template tips"
                />
              </label>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden">
            <label className="flex min-h-0 flex-1 flex-col">
              <span className="border-b border-[var(--color-border)] px-4 py-2 font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                Prompt Body
              </span>
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
              <div className="mb-2 flex items-center justify-between font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                <span>Variables</span>
                <span>{draft.variables.length}</span>
              </div>
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
                      <input
                        type="checkbox"
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
                      <label className="col-span-3 block">
                        <span className="mb-1 block font-mono text-2xs uppercase tracking-widest text-[var(--color-text-muted)]">
                          Options
                        </span>
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
                      </label>
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

export default function PromptTemplates() {
  const isInstanceActive = useIsInstanceActive()
  const templateOptionsId = useId()
  const [state, updateState] = useToolState<PromptTemplatesState>('prompt-templates', DEFAULT_STATE)
  const userTemplates = usePromptTemplatesStore((s) => s.userTemplates)
  const savingTemplates = usePromptTemplatesStore((s) => s.saving)
  const createTemplate = usePromptTemplatesStore((s) => s.create)
  const updateTemplate = usePromptTemplatesStore((s) => s.update)
  const removeTemplate = usePromptTemplatesStore((s) => s.remove)
  const importTemplates = usePromptTemplatesStore((s) => s.importMany)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [modalOpen, setModalOpen] = useState(false)
  const [editorState, setEditorState] = useState<{
    mode: 'create' | 'edit' | 'duplicate'
    template?: PromptTemplate
  } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<'fill' | 'preview'>('fill')
  const searchRef = useRef<HTMLInputElement>(null)

  const allTemplates = useMemo(
    () => [...BUILTIN_PROMPT_TEMPLATES, ...userTemplates],
    [userTemplates]
  )
  const selectedTemplate = getTemplateById(state.selectedId, allTemplates)
  const selectedValues = useMemo(
    () => mergeDefaultValues(selectedTemplate, state.inputsByTemplate[selectedTemplate.id]),
    [selectedTemplate, state.inputsByTemplate]
  )
  const renderedPrompt = useMemo(
    () => renderPrompt(selectedTemplate, selectedValues),
    [selectedTemplate, selectedValues]
  )
  const tokens = useMemo(() => estimateTokens(renderedPrompt), [renderedPrompt])
  const missingVariables = useMemo(
    () => missingRequiredVariables(selectedTemplate, selectedValues),
    [selectedTemplate, selectedValues]
  )

  const filteredTemplates = useMemo(() => {
    const query = state.search.trim().toLowerCase()
    return allTemplates.filter((template) => {
      const matchesCategory = state.category === 'all' || template.category === state.category
      const matchesSearch = !query || templateSearchText(template).includes(query)
      return matchesCategory && matchesSearch
    })
  }, [allTemplates, state.category, state.search])

  const selectTemplate = useCallback(
    (template: PromptTemplate) => {
      updateState({
        selectedId: template.id,
        inputsByTemplate: {
          ...state.inputsByTemplate,
          [template.id]: mergeDefaultValues(template, state.inputsByTemplate[template.id]),
        },
      })
      setWorkspaceTab('fill')
    },
    [state.inputsByTemplate, updateState]
  )

  const updateVariable = useCallback(
    (name: string, value: string) => {
      updateState({
        inputsByTemplate: {
          ...state.inputsByTemplate,
          [selectedTemplate.id]: {
            ...selectedValues,
            [name]: value,
          },
        },
      })
    },
    [selectedTemplate.id, selectedValues, state.inputsByTemplate, updateState]
  )

  const copyRenderedPrompt = useCallback(async () => {
    if (missingVariables.length > 0) {
      setLastAction(`Missing required fields: ${missingVariables.join(', ')}`, 'error')
      return
    }
    // Only dismiss once the text is actually on the clipboard — closing on a failed write
    // loses the filled-in variables with nothing to show for them.
    const copied = await copy(renderedPrompt, {
      success: `Copied ${selectedTemplate.name}`,
      failure: 'Failed to copy prompt',
    })
    if (copied) setModalOpen(false)
  }, [missingVariables, renderedPrompt, selectedTemplate.name, setLastAction, copy])

  const handleSaveEditor = useCallback(
    async (draft: PromptTemplateDraft) => {
      if (editorState?.mode === 'edit' && editorState.template?.author === 'user') {
        const updated = await updateTemplate(editorState.template.id, draft)
        if (updated) {
          updateState({ selectedId: updated.id })
          setLastAction('Prompt template updated', 'success')
        }
      } else {
        const created = await createTemplate(draft)
        updateState({ selectedId: created.id })
        setLastAction('Prompt template saved', 'success')
      }
      setEditorState(null)
    },
    [createTemplate, editorState, setLastAction, updateState, updateTemplate]
  )

  const handleDeleteTemplate = useCallback(async () => {
    if (selectedTemplate.author !== 'user') {
      setLastAction('Built-in templates cannot be deleted', 'error')
      return
    }
    if (confirmDeleteId !== selectedTemplate.id) return
    try {
      await removeTemplate(selectedTemplate.id)
      setConfirmDeleteId(null)
      updateState({ selectedId: BUILTIN_PROMPT_TEMPLATES[0]?.id ?? '' })
      setLastAction('Prompt template deleted', 'info')
    } catch {
      setLastAction('Failed to delete prompt template', 'error')
    }
  }, [confirmDeleteId, removeTemplate, selectedTemplate, setLastAction, updateState])

  const handleExport = useCallback(async () => {
    try {
      const exportDrafts = userTemplates.map((template) => templateToDraft(template))
      const path = await exportFile(
        serializePromptTemplateExport(exportDrafts),
        buildExportFilename('prompt-templates-backup', 'json')
      )
      if (path) setLastAction(`Exported ${exportDrafts.length} prompt templates`, 'success')
    } catch {
      setLastAction('Failed to export prompt templates', 'error')
    }
  }, [setLastAction, userTemplates])

  const handleImport = useCallback(async () => {
    try {
      const file = await openFileDialog()
      if (!file) return
      const drafts = parsePromptTemplateImport(file.content)
      const imported = await importTemplates(drafts)
      if (imported[0]) {
        updateState({ selectedId: imported[0].id })
      }
      setLastAction(`Imported ${imported.length} prompt template(s)`, 'success')
    } catch (err) {
      setLastAction(err instanceof Error ? err.message : 'Import failed', 'error')
    }
  }, [importTemplates, setLastAction, updateState])

  const clearFilters = useCallback(() => {
    updateState({ search: '', category: 'all' })
  }, [updateState])

  const handleListKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, templateId: string) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const currentIndex = filteredTemplates.findIndex((template) => template.id === templateId)
      let nextIndex = currentIndex
      if (event.key === 'ArrowDown')
        nextIndex = Math.min(filteredTemplates.length - 1, currentIndex + 1)
      if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1)
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = filteredTemplates.length - 1
      const next = filteredTemplates[nextIndex]
      if (!next) return
      selectTemplate(next)
      requestAnimationFrame(() =>
        document.getElementById(`${templateOptionsId}-option-${next.id}`)?.focus()
      )
    },
    [filteredTemplates, selectTemplate, templateOptionsId]
  )

  useToolAction((action) => {
    if (action.type === 'copy-output') {
      void copyRenderedPrompt()
    }
    if (action.type === 'execute') {
      setModalOpen(true)
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isInstanceActive) return
      if (modalOpen || editorState) return
      if (event.key === 'F5') {
        event.preventDefault()
        setEditorState({ mode: 'create' })
      }
      if (event.key === 'F6') {
        event.preventDefault()
        setEditorState({ mode: 'duplicate', template: selectedTemplate })
      }
      if (event.key === 'F7' && selectedTemplate.author === 'user') {
        event.preventDefault()
        setEditorState({ mode: 'edit', template: selectedTemplate })
      }
      if (event.key === 'F8' && selectedTemplate.author === 'user') {
        event.preventDefault()
        setConfirmDeleteId(selectedTemplate.id)
      }
      if (event.key === 'F9') {
        event.preventDefault()
        void handleExport()
      }
      if (event.key === 'F10') {
        event.preventDefault()
        void handleImport()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void copyRenderedPrompt()
      } else if (event.key === 'Enter' && !shouldIgnoreGlobalEnter(event.target)) {
        event.preventDefault()
        setModalOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    copyRenderedPrompt,
    editorState,
    handleExport,
    handleImport,
    isInstanceActive,
    modalOpen,
    selectedTemplate,
  ])

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(15rem,19rem)_minmax(0,1fr)] bg-[var(--color-bg)] max-[1000px]:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <header className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] px-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-ui text-sm font-semibold text-[var(--color-text)]">
              Prompt Templates
            </h1>
            <p className="text-2xs text-[var(--color-text-muted)]">
              {allTemplates.length} templates · {userTemplates.length} custom
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setEditorState({ mode: 'create' })}
            className="gap-1.5"
          >
            <PlusIcon size={12} aria-hidden="true" /> New
          </Button>
        </header>

        <div className="space-y-2 border-b border-[var(--color-border)] p-3">
          <SearchInput
            ref={searchRef}
            value={state.search}
            onValueChange={(search) => updateState({ search })}
            placeholder="Search templates"
            aria-label="Search prompt templates"
            clearLabel="Clear template search"
          />
          <Select
            value={state.category}
            onChange={(event) => updateState({ category: event.target.value as CategoryFilter })}
            aria-label="Filter templates by category"
            className="w-full"
          >
            {FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label} ({categoryCount(filter.id, allTemplates)})
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 text-2xs text-[var(--color-text-muted)]">
          <span>
            {filteredTemplates.length === allTemplates.length
              ? 'Library'
              : `${filteredTemplates.length} results`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="icon"
              size="xs"
              onClick={() => void handleImport()}
              title="Import templates from JSON"
              aria-label="Import templates from JSON"
            >
              <UploadSimpleIcon size={12} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="icon"
              size="xs"
              onClick={() => void handleExport()}
              title="Export custom templates as JSON"
              aria-label="Export custom templates as JSON"
              disabled={userTemplates.length === 0}
            >
              <DownloadSimpleIcon size={12} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto" role="listbox" aria-label="Prompt templates">
          {filteredTemplates.map((template, index) => {
            const selected = template.id === selectedTemplate.id
            return (
              <Button
                key={template.id}
                id={`${templateOptionsId}-option-${template.id}`}
                type="button"
                variant="ghost"
                size="xs"
                role="option"
                aria-selected={selected}
                tabIndex={
                  selected ||
                  (!filteredTemplates.some((item) => item.id === selectedTemplate.id) &&
                    index === 0)
                    ? 0
                    : -1
                }
                onClick={() => selectTemplate(template)}
                onKeyDown={(event) => handleListKeyDown(event, template.id)}
                onDoubleClick={() => {
                  selectTemplate(template)
                  setModalOpen(true)
                }}
                className={`flex w-full justify-start rounded-none border-b border-[var(--color-border)] px-3 py-2.5 text-left ${selected ? 'bg-[var(--color-accent-dim)]' : 'hover:bg-[var(--color-surface-hover)]'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text)]">
                      {template.name}
                    </span>
                    {template.author === 'user' && (
                      <StatusBadge variant="info" className="shrink-0 uppercase">
                        Custom
                      </StatusBadge>
                    )}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-2xs leading-4 text-[var(--color-text-muted)]">
                    {template.description}
                  </span>
                  <span className="mt-1.5 block text-2xs uppercase tracking-wide text-[var(--color-text-muted)]">
                    {CATEGORY_LABELS[template.category]} · {template.optimizedFor}
                  </span>
                </span>
              </Button>
            )
          })}
          {filteredTemplates.length === 0 && (
            <EmptyState
              icon={ChatCircleTextIcon}
              size="sm"
              title="No matching templates"
              description="Try a different search or category."
              action={
                <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-col">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex min-h-14 items-center gap-2 px-4 max-[1000px]:flex-wrap max-[1000px]:py-2">
            <div className="min-w-0 flex-1 max-[1000px]:basis-full">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-[var(--color-text)]">
                  {selectedTemplate.name}
                </h2>
                <StatusBadge variant="info" className="shrink-0 uppercase">
                  {selectedTemplate.author === 'user' ? 'Custom' : 'Built-in'}
                </StatusBadge>
              </div>
              <p className="mt-0.5 truncate text-2xs text-[var(--color-text-muted)]">
                {selectedTemplate.description}
              </p>
            </div>
            <Button
              type="button"
              variant="icon"
              size="sm"
              onClick={() => setEditorState({ mode: 'duplicate', template: selectedTemplate })}
              title="Duplicate template"
              aria-label="Duplicate template"
            >
              <CopyIcon size={14} aria-hidden="true" />
            </Button>
            {selectedTemplate.author === 'user' && (
              <>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setEditorState({ mode: 'edit', template: selectedTemplate })}
                  title="Edit template"
                  aria-label="Edit template"
                >
                  <PencilSimpleIcon size={14} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setConfirmDeleteId(selectedTemplate.id)}
                  title="Delete template"
                  aria-label="Delete template"
                  className="hover:text-[var(--color-error)]"
                >
                  <TrashIcon size={14} aria-hidden="true" />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-1.5"
            >
              <SparkleIcon size={14} aria-hidden="true" /> Focus mode
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void copyRenderedPrompt()}
              className="gap-1.5"
            >
              <ClipboardTextIcon size={14} aria-hidden="true" /> Copy prompt
            </Button>
          </div>
          <div className="flex items-center border-t border-[var(--color-border)] pr-4">
            <TabBar
              noBorder
              aria-label="Template workspace"
              activeTab={workspaceTab}
              onTabChange={(tab) => setWorkspaceTab(tab as 'fill' | 'preview')}
              tabs={[
                { id: 'fill', label: `Fill variables (${selectedTemplate.variables.length})` },
                { id: 'preview', label: `Preview (~${tokens})` },
              ]}
            />
            <span className="ml-auto text-2xs text-[var(--color-text-muted)]" aria-live="polite">
              {savingTemplates
                ? 'Saving template…'
                : `Optimized for ${selectedTemplate.optimizedFor}`}
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {workspaceTab === 'fill' ? (
            <div className="mx-auto max-w-3xl p-5 max-[1000px]:p-4">
              <div className="mb-5 flex flex-wrap gap-1.5">
                {selectedTemplate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--color-accent-dim)] px-2 py-1 text-2xs text-[var(--color-accent)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <VariableForm
                template={selectedTemplate}
                values={selectedValues}
                onChange={updateVariable}
              />
              {selectedTemplate.tips && selectedTemplate.tips.length > 0 && (
                <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
                  <span className="font-semibold text-[var(--color-text)]">Tip:</span>{' '}
                  {selectedTemplate.tips[0]}
                </div>
              )}
            </div>
          ) : (
            <PreviewPane
              renderedPrompt={renderedPrompt}
              tokens={tokens}
              missingVariables={missingVariables}
            />
          )}
        </div>
      </main>

      <QuickFillModal
        open={modalOpen}
        template={selectedTemplate}
        values={selectedValues}
        renderedPrompt={renderedPrompt}
        tokens={tokens}
        missingVariables={missingVariables}
        onChange={updateVariable}
        onClose={() => setModalOpen(false)}
        onCopy={() => void copyRenderedPrompt()}
      />
      {editorState && (
        <TemplateEditorModal
          mode={editorState.mode}
          {...(editorState.template ? { sourceTemplate: editorState.template } : {})}
          onClose={() => setEditorState(null)}
          onSave={handleSaveEditor}
        />
      )}
      {confirmDeleteId === selectedTemplate.id && selectedTemplate.author === 'user' && (
        <Dialog
          title="Delete prompt template?"
          onClose={() => setConfirmDeleteId(null)}
          className="w-[min(28rem,calc(100vw-2rem))]"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void handleDeleteTemplate()}>
                Delete template
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            “{selectedTemplate.name}” will be permanently deleted. This cannot be undone.
          </p>
        </Dialog>
      )}
    </div>
  )
}
