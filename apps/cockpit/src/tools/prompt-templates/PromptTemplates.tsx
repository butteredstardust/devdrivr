import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatCircleTextIcon,
  ClipboardTextIcon,
  MagnifyingGlassIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'
import { BUILTIN_PROMPT_TEMPLATES, CATEGORY_LABELS } from './builtin-templates'
import {
  estimateTokens,
  mergeDefaultValues,
  missingRequiredVariables,
  renderPrompt,
  templateSearchText,
  tokenTone,
} from './template-utils'
import type {
  PromptTemplate,
  PromptTemplateCategory,
  PromptTemplateValues,
  TokenTone,
} from './types'

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

function categoryCount(category: CategoryFilter): number {
  if (category === 'all') return BUILTIN_PROMPT_TEMPLATES.length
  return BUILTIN_PROMPT_TEMPLATES.filter((template) => template.category === category).length
}

function getTemplateById(id: string): PromptTemplate {
  const fallbackTemplate = BUILTIN_PROMPT_TEMPLATES[0]
  if (!fallbackTemplate) {
    throw new Error('No prompt templates configured')
  }
  return BUILTIN_PROMPT_TEMPLATES.find((template) => template.id === id) ?? fallbackTemplate
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
          <span className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
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
            <textarea
              value={values[variable.name] ?? ''}
              onChange={(event) => onChange(variable.name, event.target.value)}
              placeholder={variable.placeholder}
              rows={variable.name === 'code' || variable.name === 'logs' ? 10 : 5}
              aria-label={variable.label}
              className="min-h-24 w-full resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
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
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
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
    setTimeout(() => {
      fieldRootRef.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
    }, 0)
    const onKeyDown = (event: KeyboardEvent) => {
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
      window.removeEventListener('keydown', onKeyDown)
      previousActive?.focus()
    }
  }, [open])

  if (!open) return null

  const tone = tokenTone(tokens)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-6"
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-template-modal-title"
        className="grid max-h-[88vh] w-full max-w-5xl grid-cols-[minmax(20rem,0.85fr)_minmax(24rem,1fr)] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-[var(--color-shadow)]"
      >
        <div className="flex min-h-0 flex-col border-r border-[var(--color-border)]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
            <div>
              <h2
                id="prompt-template-modal-title"
                className="text-sm font-bold text-[var(--color-text)]"
              >
                {template.name}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Fill variables, then press Cmd+Enter to copy.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              aria-label="Close quick fill"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div ref={fieldRootRef} className="min-h-0 flex-1 overflow-auto p-4">
            <VariableForm template={template} values={values} onChange={onChange} />
          </div>
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border)] px-4">
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] ${tokenClass(tone)}`}
            >
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

export default function PromptTemplates() {
  const [state, updateState] = useToolState<PromptTemplatesState>('prompt-templates', DEFAULT_STATE)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [modalOpen, setModalOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const selectedTemplate = getTemplateById(state.selectedId)
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
    return BUILTIN_PROMPT_TEMPLATES.filter((template) => {
      const matchesCategory = state.category === 'all' || template.category === state.category
      const matchesSearch = !query || templateSearchText(template).includes(query)
      return matchesCategory && matchesSearch
    })
  }, [state.category, state.search])

  const selectTemplate = useCallback(
    (template: PromptTemplate) => {
      updateState({
        selectedId: template.id,
        inputsByTemplate: {
          ...state.inputsByTemplate,
          [template.id]: mergeDefaultValues(template, state.inputsByTemplate[template.id]),
        },
      })
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
    try {
      await navigator.clipboard.writeText(renderedPrompt)
      setLastAction(`Copied ${selectedTemplate.name}`, 'success')
      setModalOpen(false)
    } catch {
      setLastAction('Failed to copy prompt', 'error')
    }
  }, [missingVariables, renderedPrompt, selectedTemplate.name, setLastAction])

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
      if (modalOpen) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void copyRenderedPrompt()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copyRenderedPrompt, modalOpen])

  return (
    <div className="grid h-full grid-cols-[18rem_minmax(26rem,1fr)_minmax(22rem,0.9fr)] grid-rows-[1fr_2.5rem] bg-[var(--color-bg)]">
      <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
          <ChatCircleTextIcon size={13} />[ 01-TEMPLATES ]
        </div>
        <div className="border-b border-[var(--color-border)] p-3">
          <div className="relative">
            <MagnifyingGlassIcon
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <Input
              ref={searchRef}
              value={state.search}
              onChange={(event) => updateState({ search: event.target.value })}
              placeholder="Search prompts... (Cmd+F)"
              className="w-full pl-7"
            />
          </div>
        </div>
        <div className="border-b border-[var(--color-border)] p-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={state.category === filter.id}
                onClick={() => updateState({ category: filter.id })}
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  state.category === filter.id
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                {filter.label}{' '}
                <span className="font-mono text-[10px]">{categoryCount(filter.id)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {filteredTemplates.map((template) => {
            const selected = template.id === selectedTemplate.id
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template)}
                onDoubleClick={() => {
                  selectTemplate(template)
                  setModalOpen(true)
                }}
                className={`flex w-full flex-col gap-1 border-b border-[var(--color-border)] px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span
                  className={`text-xs font-bold ${selected ? 'text-[var(--color-bg)]' : 'text-[var(--color-text)]'}`}
                >
                  {template.name}
                </span>
                <span
                  className={`line-clamp-2 text-[10px] leading-4 ${
                    selected ? 'text-[var(--color-bg)]/75' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {template.description}
                </span>
                <span
                  className={`font-mono text-[9px] uppercase tracking-wider ${
                    selected ? 'text-[var(--color-bg)]/70' : 'text-[var(--color-accent)]'
                  }`}
                >
                  {CATEGORY_LABELS[template.category]} / {template.optimizedFor}
                </span>
              </button>
            )
          })}
          {filteredTemplates.length === 0 && (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
              No prompt templates match the current filters.
            </div>
          )}
        </div>
        <div className="border-t border-[var(--color-border)] px-3 py-1 text-[10px] text-[var(--color-text-muted)]">
          {filteredTemplates.length} shown / {BUILTIN_PROMPT_TEMPLATES.length} built in
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--color-border)]">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3 font-mono text-[10px] text-[var(--color-text-muted)]">
          <span>[ 02-FILL ]</span>
          <span>{selectedTemplate.variables.length} VARS</span>
        </div>
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-[var(--color-text)]">
                {selectedTemplate.name}
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--color-text-muted)]">
                {selectedTemplate.description}
              </p>
            </div>
            <Button size="sm" variant="primary" onClick={() => setModalOpen(true)}>
              Quick Fill
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {selectedTemplate.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--color-accent-dim)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <VariableForm
            template={selectedTemplate}
            values={selectedValues}
            onChange={updateVariable}
          />
        </div>
        {selectedTemplate.tips && selectedTemplate.tips.length > 0 && (
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
            Tip: {selectedTemplate.tips[0]}
          </div>
        )}
      </div>

      <PreviewPane
        renderedPrompt={renderedPrompt}
        tokens={tokens}
        missingVariables={missingVariables}
      />

      <div className="col-span-3 flex h-10 items-center border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-mono text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [ENTER: QUICK FILL]
          </button>
          <button
            type="button"
            onClick={() => void copyRenderedPrompt()}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [CMD+ENTER: COPY]
          </button>
          <button
            type="button"
            onClick={() => searchRef.current?.focus()}
            className="rounded px-2 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
          >
            [CMD+F: SEARCH]
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[var(--color-text-muted)]">
          <ClipboardTextIcon size={13} />
          <span>{CATEGORY_LABELS[selectedTemplate.category].toUpperCase()}</span>
          <span>~{tokens} TOKENS</span>
        </div>
      </div>

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
    </div>
  )
}
