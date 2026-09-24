import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { usePromptTemplatesBackup } from '@/hooks/usePromptTemplatesBackup'
import type { PromptTemplateDraft } from '@/lib/prompt-template-transfer'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import { BUILTIN_PROMPT_TEMPLATES } from '@/tools/prompt-templates/builtin-templates'
import {
  FILTERS,
  getTemplateById,
  type CategoryFilter,
  type PromptTemplatesState,
} from '@/tools/prompt-templates/prompt-templates-model'
import { mergeDefaultValues, templateSearchText } from '@/tools/prompt-templates/template-utils'
import type { PromptTemplate } from '@/tools/prompt-templates/types'

type UpdatePromptTemplatesState = (patch: Partial<PromptTemplatesState>) => void

type UsePromptTemplateLibraryInput = {
  state: PromptTemplatesState
  updateState: UpdatePromptTemplatesState
  templateOptionsId: string
}

export function usePromptTemplateLibrary({
  state,
  updateState,
  templateOptionsId,
}: UsePromptTemplateLibraryInput) {
  const userTemplates = usePromptTemplatesStore((s) => s.userTemplates)
  const savingTemplates = usePromptTemplatesStore((s) => s.saving)
  const createTemplate = usePromptTemplatesStore((s) => s.create)
  const updateTemplate = usePromptTemplatesStore((s) => s.update)
  const removeTemplate = usePromptTemplatesStore((s) => s.remove)
  const setLastAction = useUiStore((s) => s.setLastAction)
  const { exportBackup: handleExport, importBackup } = usePromptTemplatesBackup(setLastAction)
  const [editorState, setEditorState] = useState<{
    mode: 'create' | 'edit' | 'duplicate'
    template?: PromptTemplate
  } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<'fill' | 'preview'>('fill')

  const handleImport = useCallback(async () => {
    const importedId = await importBackup()
    if (importedId) updateState({ selectedId: importedId })
  }, [importBackup, updateState])

  const allTemplates = useMemo(
    () => [
      ...BUILTIN_PROMPT_TEMPLATES.map((template) => {
        const override = state.overrides[template.id]
        return override
          ? { ...template, ...override, author: 'builtin' as const, id: template.id }
          : template
      }),
      ...userTemplates,
    ],
    [state.overrides, userTemplates]
  )
  const selectedTemplate = getTemplateById(state.selectedId, allTemplates)

  // The filter is persisted, so it outlives the category list that produced it. A category retired
  // by a later release leaves the user on an empty library with a select that shows no value, and
  // no way to tell what went wrong. Fall back to 'all'.
  const activeCategory: CategoryFilter = FILTERS.some((filter) => filter.id === state.category)
    ? state.category
    : 'all'

  const filteredTemplates = useMemo(() => {
    const query = state.search.trim().toLowerCase()
    return allTemplates.filter((template) => {
      const matchesCategory = activeCategory === 'all' || template.category === activeCategory
      const matchesSearch = !query || templateSearchText(template).includes(query)
      return matchesCategory && matchesSearch
    })
  }, [allTemplates, activeCategory, state.search])

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

  const handleSaveEditor = useCallback(
    async (draft: PromptTemplateDraft) => {
      if (editorState?.mode === 'edit' && editorState.template?.author === 'builtin') {
        updateState({
          overrides: {
            ...state.overrides,
            [editorState.template.id]: draft,
          },
        })
        setLastAction('Built-in template override saved', 'success')
      } else if (editorState?.mode === 'edit' && editorState.template?.author === 'user') {
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
    [createTemplate, editorState, setLastAction, state.overrides, updateState, updateTemplate]
  )

  const resetSelectedOverride = useCallback(() => {
    if (selectedTemplate.author !== 'builtin' || !state.overrides[selectedTemplate.id]) return
    const overrides = { ...state.overrides }
    delete overrides[selectedTemplate.id]
    updateState({ overrides })
    setLastAction('Built-in template reset', 'info')
  }, [selectedTemplate, setLastAction, state.overrides, updateState])

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

  return {
    userTemplates,
    savingTemplates,
    editorState,
    setEditorState,
    confirmDeleteId,
    setConfirmDeleteId,
    workspaceTab,
    setWorkspaceTab,
    handleExport,
    handleImport,
    allTemplates,
    selectedTemplate,
    activeCategory,
    filteredTemplates,
    selectTemplate,
    handleSaveEditor,
    resetSelectedOverride,
    handleDeleteTemplate,
    clearFilters,
    handleListKeyDown,
  }
}
