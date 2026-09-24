import { useEffect, useId, useRef } from 'react'
import { PlusIcon } from '@phosphor-icons/react'
import { useIsInstanceActive } from '@/app/tool-instance'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'
import { useToolAction } from '@/hooks/useToolAction'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'
import { PromptTemplateSidebar } from '@/tools/prompt-templates/components/PromptTemplateSidebar'
import { PromptTemplateWorkspace } from '@/tools/prompt-templates/components/PromptTemplateWorkspace'
import { QuickFillModal } from '@/tools/prompt-templates/components/QuickFillModal'
import { TemplateEditorModal } from '@/tools/prompt-templates/components/TemplateEditorModal'
import { usePromptTemplateFill } from '@/tools/prompt-templates/hooks/usePromptTemplateFill'
import { usePromptTemplateLibrary } from '@/tools/prompt-templates/hooks/usePromptTemplateLibrary'
import {
  DEFAULT_STATE,
  shouldIgnoreGlobalEnter,
  validatePromptTemplatesState,
  type PromptTemplatesState,
} from '@/tools/prompt-templates/prompt-templates-model'

export default function PromptTemplates() {
  const isInstanceActive = useIsInstanceActive()
  const templateOptionsId = useId()
  const [state, updateState] = useToolState<PromptTemplatesState>(
    'prompt-templates',
    DEFAULT_STATE,
    { validate: validatePromptTemplatesState }
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const library = usePromptTemplateLibrary({ state, updateState, templateOptionsId })
  const fill = usePromptTemplateFill({
    state,
    updateState,
    selectedTemplate: library.selectedTemplate,
  })
  const {
    selectedTemplate,
    editorState,
    setEditorState,
    setConfirmDeleteId,
    handleExport,
    handleImport,
  } = library
  const { selectedValues, copyRenderedPrompt, modalOpen, setModalOpen } = fill
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state.handoffContent) return
    const variable =
      selectedTemplate.variables.find((item) =>
        /code|context|content|input|text|prompt/i.test(item.name)
      ) ?? selectedTemplate.variables[0]
    if (!variable) {
      updateState({ handoffContent: '', handoffLanguage: '' })
      setLastAction('This template has no field for handed-off content', 'info')
      return
    }
    updateState({
      inputsByTemplate: {
        ...state.inputsByTemplate,
        [selectedTemplate.id]: {
          ...selectedValues,
          [variable.name]: state.handoffContent,
        },
      },
      handoffContent: '',
      handoffLanguage: '',
    })
  }, [
    selectedTemplate,
    selectedValues,
    state.handoffContent,
    state.handoffLanguage,
    state.inputsByTemplate,
    setLastAction,
    updateState,
  ])

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
    modalOpen,
    setModalOpen,
    isInstanceActive,
    editorState,
    handleExport,
    handleImport,
    selectedTemplate,
    setConfirmDeleteId,
    setEditorState,
  ])

  return (
    <>
      <MasterDetailLayout
        title="Prompt Templates"
        widthStorageKey="prompt-templates"
        subtitle={`${library.allTemplates.length} templates · ${library.userTemplates.length} custom`}
        sidebarActions={
          // Secondary, not primary: the detail pane's Copy prompt is this tool's one primary
          // action, and a sidebar heading shouldn't compete with it for the eye.
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => library.setEditorState({ mode: 'create' })}
            className="gap-1.5"
          >
            <PlusIcon size={12} aria-hidden="true" /> New
          </Button>
        }
        sidebar={
          <PromptTemplateSidebar
            state={state}
            updateState={updateState}
            searchRef={searchRef}
            templateOptionsId={templateOptionsId}
            library={library}
            onOpenQuickFill={() => fill.setModalOpen(true)}
          />
        }
      >
        <PromptTemplateWorkspace state={state} library={library} fill={fill} />
      </MasterDetailLayout>

      <QuickFillModal
        open={fill.modalOpen}
        template={library.selectedTemplate}
        values={fill.selectedValues}
        renderedPrompt={fill.renderedPrompt}
        tokens={fill.tokens}
        missingVariables={fill.missingVariables}
        onChange={fill.updateVariable}
        onClose={() => fill.setModalOpen(false)}
        onCopy={() => void fill.copyRenderedPrompt()}
      />
      {library.editorState && (
        <TemplateEditorModal
          mode={library.editorState.mode}
          {...(library.editorState.template
            ? { sourceTemplate: library.editorState.template }
            : {})}
          onClose={() => library.setEditorState(null)}
          onSave={library.handleSaveEditor}
        />
      )}
      {library.confirmDeleteId === library.selectedTemplate.id &&
        library.selectedTemplate.author === 'user' && (
          <Dialog
            title="Delete prompt template?"
            onClose={() => library.setConfirmDeleteId(null)}
            size="md"
            footer={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => library.setConfirmDeleteId(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void library.handleDeleteTemplate()}
                >
                  Delete template
                </Button>
              </>
            }
          >
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              “{library.selectedTemplate.name}” will be permanently deleted. This cannot be undone.
            </p>
          </Dialog>
        )}
    </>
  )
}
