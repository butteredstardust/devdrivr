import { useCallback, useState, type RefObject } from 'react'
import { dispatchToolAction } from '@/lib/tool-actions'
import { openFileDialog, saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import {
  generateSample,
  inferSchema,
  parseJson,
  type JsonSchemaState,
  type Pane,
  type UpdateJsonSchemaState,
} from '@/tools/json-schema-validator/json-schema-helpers'
import { TEMPLATES, findMatchingTemplate } from '@/tools/json-schema-validator/templates'

type UseJsonSchemaDocumentActionsOptions = {
  state: JsonSchemaState
  updateState: UpdateJsonSchemaState
  dataRef: RefObject<string>
  schemaRef: RefObject<string>
}

export function useJsonSchemaDocumentActions({
  state,
  updateState,
  dataRef,
  schemaRef,
}: UseJsonSchemaDocumentActionsOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)
  // Every generator here overwrites a whole buffer. Without a way back, one
  // click on "Infer schema" silently destroys a hand-written schema.
  const [undoBuffer, setUndoBuffer] = useState<{
    data: string
    schema: string
    label: string
  } | null>(null)

  // --- Buffer actions --------------------------------------------------

  /** Replaces buffers, keeping the previous contents recoverable. */
  const applyBuffers = useCallback(
    (next: Partial<JsonSchemaState>, label: string) => {
      setUndoBuffer({ data: dataRef.current, schema: schemaRef.current, label })
      updateState(next)
    },
    [updateState, dataRef, schemaRef]
  )

  const handleUndo = useCallback(() => {
    if (!undoBuffer) return
    updateState({ data: undoBuffer.data, schema: undoBuffer.schema })
    setUndoBuffer(null)
    setLastAction('Reverted', 'info')
  }, [undoBuffer, updateState, setLastAction])

  const loadTemplate = useCallback(
    (key: string) => {
      const template = TEMPLATES[key]
      if (!template) return
      applyBuffers(
        {
          schema: JSON.stringify(template.schema, null, 2),
          data: JSON.stringify(template.sample, null, 2),
        },
        `Load ${template.label}`
      )
      setLastAction(`Loaded the ${template.label} template`, 'info')
    },
    [applyBuffers, setLastAction]
  )

  const handleInferSchema = useCallback(() => {
    // Read fresh rather than off the debounced snapshot: a click landing inside
    // the debounce window must infer from what is actually in the buffer.
    const parsed = parseJson(dataRef.current)
    if (parsed.status !== 'valid') {
      setLastAction(
        parsed.status === 'empty' ? 'Add some JSON data first' : 'The JSON data does not parse',
        'error'
      )
      return
    }
    applyBuffers({ schema: JSON.stringify(inferSchema(parsed.value), null, 2) }, 'Infer schema')
    setLastAction('Inferred a schema from the data', 'success')
  }, [applyBuffers, setLastAction, dataRef])

  const handleGenerateSample = useCallback(() => {
    const parsed = parseJson(schemaRef.current)
    if (parsed.status !== 'valid') {
      setLastAction(
        parsed.status === 'empty' ? 'Add a schema first' : 'The schema does not parse',
        'error'
      )
      return
    }
    const template = findMatchingTemplate(parsed.value)
    const sample = template
      ? template.sample
      : generateSample((parsed.value ?? {}) as Record<string, unknown>)
    applyBuffers({ data: JSON.stringify(sample, null, 2) }, 'Generate sample')
    setLastAction(template ? 'Loaded the template sample' : 'Generated sample data', 'success')
  }, [applyBuffers, setLastAction, schemaRef])

  const handleFormat = useCallback(
    (pane: Pane) => {
      const text = pane === 'data' ? dataRef.current : schemaRef.current
      const parsed = parseJson(text)
      if (parsed.status !== 'valid') {
        setLastAction(`The ${pane} does not parse`, 'error')
        return
      }
      const formatted = JSON.stringify(parsed.value, null, 2)
      if (formatted === text) return
      applyBuffers(pane === 'data' ? { data: formatted } : { schema: formatted }, `Format ${pane}`)
      setLastAction('Formatted', 'success')
    },
    [applyBuffers, setLastAction, dataRef, schemaRef]
  )

  const handleSave = useCallback(
    (pane: Pane) => {
      const text = pane === 'data' ? dataRef.current : schemaRef.current
      if (!text.trim()) {
        setLastAction('Nothing to save yet', 'info')
        return
      }
      const fallback = pane === 'data' ? 'data.json' : 'schema.json'
      const name = (pane === 'data' ? state.dataFileName : state.schemaFileName) ?? fallback
      void saveFileDialog(text, name).then(
        (path) =>
          setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
        (err: unknown) =>
          setLastAction(`Save failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      )
    },
    [state.dataFileName, state.schemaFileName, setLastAction, dataRef, schemaRef]
  )

  const handleOpen = useCallback(async () => {
    try {
      const opened = await openFileDialog()
      if (opened) dispatchToolAction({ type: 'open-file', ...opened })
    } catch (err) {
      setLastAction(`Open failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [setLastAction])

  return {
    undoBuffer,
    setUndoBuffer,
    applyBuffers,
    handleUndo,
    loadTemplate,
    handleInferSchema,
    handleGenerateSample,
    handleFormat,
    handleSave,
    handleOpen,
  }
}
