import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useUiStore } from '@/stores/ui.store'

type JsonSchemaState = {
  data: string
  schema: string
}

type ValidationError = {
  path: string
  message: string
}

const TEMPLATES: Record<string, string> = {
  basic: JSON.stringify({
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer', minimum: 0 },
      email: { type: 'string', format: 'email' },
    },
    required: ['name', 'email'],
  }, null, 2),
}

export default function JsonSchemaValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<JsonSchemaState>('json-schema-validator', {
    data: '',
    schema: TEMPLATES['basic'] ?? '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [valid, setValid] = useState<boolean | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!state.data.trim() || !state.schema.trim()) {
      setErrors([])
      setValid(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        const data = JSON.parse(state.data)
        const schema = JSON.parse(state.schema)
        const ajv = new Ajv({ allErrors: true, verbose: true })
        addFormats(ajv)
        const validate = ajv.compile(schema)
        const isValid = validate(data)

        if (isValid) {
          setValid(true)
          setErrors([])
          setLastAction('Valid', 'success')
        } else {
          setValid(false)
          const errs = (validate.errors ?? []).map((e) => ({
            path: e.instancePath || '/',
            message: e.message ?? 'Unknown error',
          }))
          setErrors(errs)
          setLastAction(`${errs.length} error(s)`, 'error')
        }
      } catch (e) {
        setValid(false)
        setErrors([{ path: '/', message: (e as Error).message }])
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.data, state.schema, setLastAction])

  const loadTemplate = useCallback((name: string) => {
    const tmpl = TEMPLATES[name]
    if (tmpl) updateState({ schema: tmpl })
  }, [updateState])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            onClick={() => loadTemplate(name)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <div className="ml-auto">
          {valid === true && <span className="text-xs text-[var(--color-success)]">✓ Valid</span>}
          {valid === false && <span className="text-xs text-[var(--color-error)]">✗ Invalid ({errors.length} errors)</span>}
        </div>
      </div>
      {errors.length > 0 && (
        <div className="max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className="text-xs text-[var(--color-error)]">
              <span className="text-[var(--color-text-muted)]">{e.path}</span> {e.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">JSON Data</div>
          <div className="flex-1">
            <Editor
              language="json"
              value={state.data}
              onChange={(v) => updateState({ data: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">JSON Schema</div>
          <div className="flex-1">
            <Editor
              language="json"
              value={state.schema}
              onChange={(v) => updateState({ schema: v ?? '' })}
              options={EDITOR_OPTIONS}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
