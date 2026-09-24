import { useCallback, useMemo, useState } from 'react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { sendToTool } from '@/lib/tool-handoff'
import { useUiStore } from '@/stores/ui.store'
import type { PromptTemplatesState } from '@/tools/prompt-templates/prompt-templates-model'
import {
  estimateTokens,
  mergeDefaultValues,
  missingRequiredVariables,
  renderPrompt,
} from '@/tools/prompt-templates/template-utils'
import type { PromptTemplate } from '@/tools/prompt-templates/types'

type UsePromptTemplateFillInput = {
  state: PromptTemplatesState
  updateState: (patch: Partial<PromptTemplatesState>) => void
  selectedTemplate: PromptTemplate
}

export function usePromptTemplateFill({
  state,
  updateState,
  selectedTemplate,
}: UsePromptTemplateFillInput) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  const copy = useCopyToClipboard()
  const [modalOpen, setModalOpen] = useState(false)
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

  const clearVariables = useCallback(() => {
    updateState({
      inputsByTemplate: {
        ...state.inputsByTemplate,
        [selectedTemplate.id]: {},
      },
    })
    setLastAction('Template fields cleared', 'info')
  }, [selectedTemplate.id, setLastAction, state.inputsByTemplate, updateState])

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

  const sendRenderedToSnippet = useCallback(() => {
    if (missingVariables.length > 0) {
      setLastAction(`Missing required fields: ${missingVariables.join(', ')}`, 'error')
      return
    }
    sendToTool('snippets', {
      handoff: {
        title: selectedTemplate.name,
        content: renderedPrompt,
        language: 'text',
      },
    })
    setLastAction('Rendered prompt sent to Snippets', 'success')
  }, [missingVariables, renderedPrompt, selectedTemplate.name, setLastAction])

  return {
    modalOpen,
    setModalOpen,
    selectedValues,
    renderedPrompt,
    tokens,
    missingVariables,
    updateVariable,
    clearVariables,
    copyRenderedPrompt,
    sendRenderedToSnippet,
  }
}
