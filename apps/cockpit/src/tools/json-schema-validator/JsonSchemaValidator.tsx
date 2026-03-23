import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

// ── Types ────────────────────────────────────────────────────────────

type JsonSchemaState = {
  data: string
  schema: string
  strict: boolean
}

type ValidationError = {
  path: string
  message: string
  keyword?: string
}

// ── Templates ────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { label: string; schema: object; sample: object }> = {
  basic: {
    label: 'Basic',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0 },
        email: { type: 'string', format: 'email' },
      },
      required: ['name', 'email'],
    },
    sample: { name: 'Alice', age: 30, email: 'alice@example.com' },
  },
  array: {
    label: 'Array',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', minLength: 1 },
          done: { type: 'boolean' },
        },
        required: ['id', 'title'],
      },
      minItems: 1,
    },
    sample: [
      { id: 1, title: 'Buy groceries', done: false },
      { id: 2, title: 'Walk the dog', done: true },
    ],
  },
  nested: {
    label: 'Nested',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                zip: { type: 'string', pattern: '^\\d{5}$' },
              },
              required: ['street', 'city'],
            },
          },
          required: ['name'],
        },
      },
    },
    sample: {
      user: {
        name: 'Bob',
        address: { street: '123 Main St', city: 'Springfield', zip: '62704' },
      },
    },
  },
  enum: {
    label: 'Enum / oneOf',
    schema: {
      type: 'object',
      properties: {
        status: { enum: ['active', 'inactive', 'pending'] },
        priority: { oneOf: [{ type: 'integer', minimum: 1, maximum: 5 }, { type: 'string', enum: ['low', 'medium', 'high'] }] },
      },
      required: ['status'],
    },
    sample: { status: 'active', priority: 3 },
  },
  formats: {
    label: 'Formats',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        website: { type: 'string', format: 'uri' },
        created: { type: 'string', format: 'date-time' },
        ip: { type: 'string', format: 'ipv4' },
        uuid: { type: 'string', format: 'uuid' },
      },
    },
    sample: {
      email: 'test@example.com',
      website: 'https://example.com',
      created: '2026-03-23T12:00:00Z',
      ip: '192.168.1.1',
      uuid: '550e8400-e29b-41d4-a716-446655440000',
    },
  },
  allOf: {
    label: 'allOf',
    schema: {
      allOf: [
        {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'user', 'guest'] },
          },
          required: ['name', 'role'],
        },
      ],
    },
    sample: { id: 1, name: 'Admin', role: 'admin' },
  },
  conditional: {
    label: 'Conditional',
    schema: {
      type: 'object',
      properties: {
        type: { enum: ['personal', 'business'] },
        company: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['type', 'name'],
      if: { properties: { type: { const: 'business' } } },
      then: { required: ['company'] },
    },
    sample: { type: 'business', name: 'Bob', company: 'Acme Corp' },
  },
}

// ── Schema Inference ─────────────────────────────────────────────────

function inferSchema(data: unknown): object {
  if (data === null) return { type: 'null' }
  if (Array.isArray(data)) {
    if (data.length === 0) return { type: 'array' }
    // Infer from first item
    return { type: 'array', items: inferSchema(data[0]) }
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const properties: Record<string, object> = {}
    const required: string[] = []
    for (const [key, val] of Object.entries(obj)) {
      properties[key] = inferSchema(val)
      required.push(key)
    }
    return { type: 'object', properties, required }
  }
  if (typeof data === 'number') {
    return Number.isInteger(data) ? { type: 'integer' } : { type: 'number' }
  }
  if (typeof data === 'boolean') return { type: 'boolean' }
  if (typeof data === 'string') {
    // Detect common formats
    if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(data)) return { type: 'string', format: 'email' }
    if (/^\d{4}-\d{2}-\d{2}T/.test(data)) return { type: 'string', format: 'date-time' }
    if (/^https?:\/\//.test(data)) return { type: 'string', format: 'uri' }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
      return { type: 'string', format: 'uuid' }
    }
    return { type: 'string' }
  }
  return {}
}

// ── Component ────────────────────────────────────────────────────────

export default function JsonSchemaValidator() {
  useMonacoTheme()
  const [state, updateState] = useToolState<JsonSchemaState>('json-schema-validator', {
    data: '',
    schema: JSON.stringify(TEMPLATES['basic']!.schema, null, 2),
    strict: false,
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [valid, setValid] = useState<boolean | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ajvRef = useRef<Ajv | null>(null)
  const ajvStrictRef = useRef(state.strict)

  // Live validation
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

        // Reuse Ajv instance, only recreate when strict mode changes
        if (!ajvRef.current || ajvStrictRef.current !== state.strict) {
          ajvRef.current = new Ajv({ allErrors: true, verbose: true, strict: state.strict })
          addFormats(ajvRef.current)
          ajvStrictRef.current = state.strict
        }
        // removeSchema to allow recompilation with different schemas
        ajvRef.current.removeSchema()
        const validate = ajvRef.current.compile(schema)
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
            keyword: e.keyword,
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
  }, [state.data, state.schema, state.strict, setLastAction])

  const loadTemplate = useCallback(
    (key: string) => {
      const tmpl = TEMPLATES[key]
      if (tmpl) {
        updateState({
          schema: JSON.stringify(tmpl.schema, null, 2),
          data: JSON.stringify(tmpl.sample, null, 2),
        })
        setLastAction(`Loaded "${tmpl.label}" template`, 'info')
      }
    },
    [updateState, setLastAction]
  )

  const generateSchema = useCallback(() => {
    if (!state.data.trim()) return
    try {
      const data = JSON.parse(state.data)
      const schema = inferSchema(data)
      updateState({ schema: JSON.stringify(schema, null, 2) })
      setLastAction('Schema inferred from data', 'success')
    } catch {
      setLastAction('Could not parse JSON data', 'error')
    }
  }, [state.data, updateState, setLastAction])

  const generateSample = useCallback(() => {
    // Try to find current template match and load its sample
    try {
      const currentSchema = JSON.parse(state.schema)
      for (const tmpl of Object.values(TEMPLATES)) {
        if (JSON.stringify(tmpl.schema) === JSON.stringify(currentSchema)) {
          updateState({ data: JSON.stringify(tmpl.sample, null, 2) })
          setLastAction('Loaded template sample data', 'success')
          return
        }
      }
      // If no template match, generate minimal sample
      const sample = generateMinimalSample(currentSchema)
      updateState({ data: JSON.stringify(sample, null, 2) })
      setLastAction('Generated sample data', 'success')
    } catch {
      setLastAction('Could not parse schema', 'error')
    }
  }, [state.schema, updateState, setLastAction])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.entries(TEMPLATES).map(([key, tmpl]) => (
          <button
            key={key}
            onClick={() => loadTemplate(key)}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            {tmpl.label}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
        <button
          onClick={generateSchema}
          className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-info)] hover:bg-[var(--color-surface-hover)]"
          title="Infer a schema from the current JSON data"
        >
          Infer Schema
        </button>
        <button
          onClick={generateSample}
          className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-info)] hover:bg-[var(--color-surface-hover)]"
          title="Generate sample data from the current schema"
        >
          Generate Sample
        </button>
        <button
          onClick={() => updateState({ strict: !state.strict })}
          className={`rounded border px-2 py-0.5 text-[10px] ${
            state.strict
              ? 'border-[var(--color-warning)] text-[var(--color-warning)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          }`}
          title="Strict mode catches schema authoring errors"
        >
          Strict
        </button>
        <div className="ml-auto flex items-center gap-2">
          {valid === true && (
            <span className="rounded bg-[var(--color-success)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
              ✓ Valid
            </span>
          )}
          {valid === false && (
            <span className="rounded bg-[var(--color-error)] px-2 py-0.5 text-[10px] font-bold text-white">
              ✗ {errors.length} error{errors.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Error panel */}
      {errors.length > 0 && (
        <div className="max-h-28 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 text-xs">
              <span className="shrink-0 rounded bg-[var(--color-error)] px-1 py-0 text-[10px] font-bold text-white">
                {e.keyword ?? 'error'}
              </span>
              <code className="shrink-0 text-[var(--color-accent)]">{e.path}</code>
              <span className="text-[var(--color-error)]">{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Editors */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">JSON Data</span>
            <CopyButton text={state.data} />
          </div>
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
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">JSON Schema</span>
            <CopyButton text={state.schema} />
          </div>
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

// ── Minimal sample generator ─────────────────────────────────────────

function generateMinimalSample(schema: Record<string, unknown>): unknown {
  const type = schema['type'] as string | undefined
  if (type === 'object') {
    const props = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
    const obj: Record<string, unknown> = {}
    for (const [key, propSchema] of Object.entries(props)) {
      obj[key] = generateMinimalSample(propSchema)
    }
    return obj
  }
  if (type === 'array') {
    const items = schema['items'] as Record<string, unknown> | undefined
    return items ? [generateMinimalSample(items)] : []
  }
  if (type === 'string') {
    const fmt = schema['format'] as string | undefined
    const enumVals = schema['enum'] as string[] | undefined
    if (enumVals) return enumVals[0] ?? ''
    if (fmt === 'email') return 'user@example.com'
    if (fmt === 'uri') return 'https://example.com'
    if (fmt === 'date-time') return new Date().toISOString()
    if (fmt === 'uuid') return '00000000-0000-0000-0000-000000000000'
    if (fmt === 'ipv4') return '127.0.0.1'
    return 'string'
  }
  if (type === 'integer' || type === 'number') {
    const min = schema['minimum'] as number | undefined
    return min ?? 0
  }
  if (type === 'boolean') return true
  if (type === 'null') return null

  // Handle enum at top level
  const enumVals = schema['enum'] as unknown[] | undefined
  if (enumVals) return enumVals[0] ?? null

  // Handle allOf
  const allOf = schema['allOf'] as Record<string, unknown>[] | undefined
  if (allOf) {
    const merged: Record<string, unknown> = {}
    for (const sub of allOf) {
      const sample = generateMinimalSample(sub)
      if (typeof sample === 'object' && sample !== null) Object.assign(merged, sample)
    }
    return merged
  }

  // Handle oneOf — pick first
  const oneOf = (schema['oneOf'] ?? schema['anyOf']) as Record<string, unknown>[] | undefined
  if (oneOf?.[0]) return generateMinimalSample(oneOf[0])

  return null
}
