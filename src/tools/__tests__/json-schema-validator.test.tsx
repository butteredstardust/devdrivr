import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, waitFor } from '@testing-library/react'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { renderTool } from './test-utils'
import JsonSchemaValidator from '../json-schema-validator/JsonSchemaValidator'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import {
  generateSample,
  detectSchemaDialect,
  inferSchema,
  mergeSchemas,
  offsetToLocation,
  parseJson,
  pointerLocation,
  validateJson,
} from '../json-schema-validator/json-schema-helpers'
import { TEMPLATES, findMatchingTemplate } from '../json-schema-validator/templates'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

const OBJECT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
})

/** The data editor — the schema pane renders a second Monaco beside it. */
function dataEditor() {
  return screen.getAllByTestId('monaco-editor')[0] as HTMLTextAreaElement
}

function schemaEditor() {
  return screen.getAllByTestId('monaco-editor')[1] as HTMLTextAreaElement
}

describe('json-schema helpers', () => {
  it('reports the detected schema dialect', () => {
    expect(detectSchemaDialect('{}')).toBe('draft-07 (default)')
    expect(detectSchemaDialect('{"$schema":"https://json-schema.org/draft/2020-12/schema"}')).toBe(
      '2020-12'
    )
    expect(detectSchemaDialect('{"$schema":"http://json-schema.org/draft-06/schema#"}')).toBe(
      'draft-06 (unsupported)'
    )
  })
  describe('parseJson', () => {
    it('reports the line and column of a syntax error', () => {
      const result = parseJson('{\n  "a": 1,\n  "b" 2\n}')
      expect(result.status).toBe('invalid')
      if (result.status !== 'invalid') throw new Error('expected an invalid parse')
      expect(result.location?.line).toBe(3)
    })

    it('treats blank input as empty rather than invalid', () => {
      expect(parseJson('   \n ').status).toBe('empty')
    })
  })

  describe('offsetToLocation', () => {
    it('counts lines and columns from one', () => {
      expect(offsetToLocation('ab\ncd', 0)).toEqual({ line: 1, column: 1 })
      expect(offsetToLocation('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
    })

    it('clamps an offset past the end instead of running off', () => {
      expect(offsetToLocation('ab', 99)).toEqual({ line: 1, column: 3 })
    })
  })

  describe('pointerLocation', () => {
    const document = `{
  "users": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": 7 }
  ]
}`

    it('finds a nested value in the source text', () => {
      // The offending value is on line 4 — the point of the problems list is
      // landing the cursor there instead of reading a pointer aloud.
      expect(pointerLocation(document, '/users/1/name')).toEqual({ line: 4, column: 24 })
    })

    it('maps the empty pointer to the document root', () => {
      expect(pointerLocation(document, '')).toEqual({ line: 1, column: 1 })
    })

    it('unescapes ~1 and ~0 the way Ajv escapes them', () => {
      const text = '{ "a/b": { "c~d": true } }'
      expect(pointerLocation(text, '/a~1b/c~0d')).toEqual({ line: 1, column: 19 })
    })

    it('is not fooled by braces inside strings', () => {
      const text = '{ "a": "}{ \\" [1,2]", "b": 5 }'
      expect(pointerLocation(text, '/b')).toEqual({ line: 1, column: 28 })
    })

    it('returns null for a path that is not there', () => {
      expect(pointerLocation(document, '/missing')).toBeNull()
    })

    it('points at the last of two duplicate keys, as JSON.parse does', () => {
      // Ajv validated the value `JSON.parse` kept — the later one — so landing
      // the cursor on the earlier duplicate would point at innocent text.
      const text = '{ "a": 1, "a": 2 }'
      expect(pointerLocation(text, '/a')).toEqual({ line: 1, column: 16 })
    })
  })

  describe('validateJson', () => {
    it('separates a malformed document from a malformed schema', () => {
      expect(validateJson('{', OBJECT_SCHEMA, { strict: false }).status).toBe('data-error')
      expect(validateJson('{}', '{', { strict: false }).status).toBe('schema-error')
    })

    it('reports an uncompilable schema as a schema error, not a data error', () => {
      const report = validateJson('{}', '{ "type": "nonsense" }', { strict: false })
      expect(report.status).toBe('schema-error')
    })

    it('waits until both sides are filled in', () => {
      expect(validateJson('', OBJECT_SCHEMA, { strict: false }).status).toBe('empty')
      expect(validateJson('{}', '', { strict: false }).status).toBe('empty')
    })

    it('returns issues carrying the pointer and keyword', () => {
      const report = validateJson('{"name": 5}', OBJECT_SCHEMA, { strict: false })
      if (report.status !== 'invalid') throw new Error('expected an invalid report')
      expect(report.total).toBe(1)
      expect(report.issues[0]).toMatchObject({ pointer: '/name', keyword: 'type' })
    })

    it('names the offending property for additionalProperties', () => {
      const schema = JSON.stringify({ type: 'object', additionalProperties: false })
      const report = validateJson('{"nope": 1}', schema, { strict: false })
      if (report.status !== 'invalid') throw new Error('expected an invalid report')
      expect(report.issues[0]?.message).toContain('nope')
    })

    it('lists the allowed values for an enum', () => {
      const schema = JSON.stringify({ enum: ['a', 'b'] })
      const report = validateJson('"c"', schema, { strict: false })
      if (report.status !== 'invalid') throw new Error('expected an invalid report')
      expect(report.issues[0]?.message).toContain('"a"')
    })

    it('caps the rendered issues but still reports the real total', () => {
      const schema = JSON.stringify({ type: 'array', items: { type: 'string' } })
      const data = JSON.stringify(Array.from({ length: 500 }, (_, i) => i))
      const report = validateJson(data, schema, { strict: false })
      if (report.status !== 'invalid') throw new Error('expected an invalid report')
      expect(report.total).toBe(500)
      expect(report.issues).toHaveLength(200)
    })

    it('only rejects an unknown keyword in strict mode', () => {
      const schema = JSON.stringify({ type: 'object', nonsenseKeyword: true })
      expect(validateJson('{}', schema, { strict: false }).status).toBe('valid')
      expect(validateJson('{}', schema, { strict: true }).status).toBe('schema-error')
    })

    it('compiles a draft 2020-12 schema', () => {
      // Ajv's default export only knows draft-07 and fails to resolve the
      // 2020-12 meta-schema, which is the dialect OpenAPI 3.1 documents use.
      const schema = JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { tags: { type: 'array', prefixItems: [{ type: 'string' }] } },
      })
      expect(validateJson('{"tags": ["a"]}', schema, { strict: false }).status).toBe('valid')
      expect(validateJson('{"tags": [1]}', schema, { strict: false }).status).toBe('invalid')
    })

    it('compiles a draft 2019-09 schema', () => {
      const schema = JSON.stringify({
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        required: ['a'],
      })
      expect(validateJson('{"a": 1}', schema, { strict: false }).status).toBe('valid')
    })

    it('validates the same data again after the schema is edited', () => {
      // Ajv caches compiled schemas by identity; a stale cache used to make the
      // second verdict the first schema's.
      const strictSchema = JSON.stringify({ type: 'object', required: ['a'] })
      expect(validateJson('{}', strictSchema, { strict: false }).status).toBe('invalid')
      expect(validateJson('{}', JSON.stringify({ type: 'object' }), { strict: false }).status).toBe(
        'valid'
      )
    })
  })

  describe('inferSchema', () => {
    it('describes scalars, formats, and required keys', () => {
      const schema = inferSchema({ name: 'Alice', email: 'a@b.co', age: 30, score: 1.5 })
      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer' },
          score: { type: 'number' },
        },
        required: ['name', 'email', 'age', 'score'],
      })
    })

    it('merges every array item instead of trusting the first', () => {
      // Reading only item 0 produced a schema that rejected the very data it
      // was inferred from.
      const schema = inferSchema([{ id: 1 }, { id: 2, note: 'later addition' }])
      const items = (schema as { items: Record<string, unknown> }).items
      expect(Object.keys(items['properties'] as object)).toEqual(['id', 'note'])
      expect(items['required']).toEqual(['id'])
    })

    it('widens integer and number to number', () => {
      const schema = inferSchema([1, 2.5])
      expect((schema as { items: { type: string } }).items.type).toBe('number')
    })

    it('produces a schema its own data satisfies', () => {
      const data = [
        { id: 1, tags: ['a'] },
        { id: 2, tags: [], extra: null },
      ]
      const report = validateJson(JSON.stringify(data), JSON.stringify(inferSchema(data)), {
        strict: false,
      })
      expect(report.status).toBe('valid')
    })
  })

  describe('mergeSchemas', () => {
    it('keeps a format only when both sides agree', () => {
      const same = mergeSchemas({ type: 'string', format: 'email' }, { type: 'string' })
      expect(same['format']).toBeUndefined()
    })
  })

  describe('generateSample', () => {
    it('fills in each template shape well enough to validate', () => {
      for (const [key, template] of Object.entries(TEMPLATES)) {
        const report = validateJson(
          JSON.stringify(template.sample),
          JSON.stringify(template.schema),
          { strict: false }
        )
        expect(report.status, `${key} sample`).toBe('valid')
      }
    })

    it('ships templates that survive the tool’s own strict mode', () => {
      // Offering a template that the Strict button then rejects makes the tool
      // look broken at the first thing a new user clicks.
      for (const [key, template] of Object.entries(TEMPLATES)) {
        const report = validateJson(
          JSON.stringify(template.sample),
          JSON.stringify(template.schema),
          { strict: true }
        )
        expect(report.status, `${key} under strict mode`).toBe('valid')
      }
    })

    it('honours enum, format, and minimum', () => {
      const sample = generateSample({
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['on', 'off'] },
          email: { type: 'string', format: 'email' },
          count: { type: 'integer', minimum: 5 },
        },
      }) as Record<string, unknown>
      expect(sample['status']).toBe('on')
      expect(sample['email']).toBe('user@example.com')
      expect(sample['count']).toBe(5)
    })
  })

  describe('findMatchingTemplate', () => {
    it('recognises a template schema and misses anything else', () => {
      expect(findMatchingTemplate(TEMPLATES['basic']?.schema)?.label).toBe('Basic object')
      expect(findMatchingTemplate({ type: 'string' })).toBeNull()
    })
  })
})

describe('JsonSchemaValidator', () => {
  it('renders both editors', () => {
    renderTool(JsonSchemaValidator)
    expect(screen.getByText('JSON Data')).toBeInTheDocument()
    expect(screen.getByText('JSON Schema')).toBeInTheDocument()
  })

  it('announces a valid document in a live region', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"name": "test"}' } })
    fireEvent.change(schemaEditor(), { target: { value: OBJECT_SCHEMA } })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Valid/)
    })
  })

  it('lists each problem with its path and keyword', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"name": 5}' } })
    fireEvent.change(schemaEditor(), { target: { value: OBJECT_SCHEMA } })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 problem found')
    })
    expect(screen.getByText('/name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /must be string/ })).toBeInTheDocument()
  })

  it('says which side failed to parse', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"name":' } })
    fireEvent.change(schemaEditor(), { target: { value: OBJECT_SCHEMA } })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('The JSON data does not parse')
    })

    fireEvent.change(dataEditor(), { target: { value: '{}' } })
    fireEvent.change(schemaEditor(), { target: { value: '{ "type": ' } })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('The schema does not parse')
    })
  })

  it('loads a template into both editors', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'array' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load template' }))
    await waitFor(() => {
      expect(dataEditor().value).toContain('Buy groceries')
    })
    expect(schemaEditor().value).toContain('minItems')
  })

  it('does not touch the buffers until the template is explicitly loaded', async () => {
    // WebKit fires `change` for every arrow key on a closed select, so loading
    // on change alone destroyed both buffers during keyboard navigation.
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"mine": true}' } })
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'array' } })
    await waitFor(() => {
      expect(screen.getByLabelText('Template')).toHaveValue('array')
    })
    expect(dataEditor().value).toBe('{"mine": true}')
  })

  it('infers a schema from the data and lets the previous one be restored', async () => {
    renderTool(JsonSchemaValidator)
    const original = schemaEditor().value
    fireEvent.change(dataEditor(), { target: { value: '{"count": 2}' } })
    fireEvent.click(screen.getByRole('button', { name: /Infer schema/ }))
    await waitFor(() => {
      expect(schemaEditor().value).toContain('"integer"')
    })

    fireEvent.click(screen.getByRole('button', { name: /Undo infer schema/i }))
    await waitFor(() => {
      expect(schemaEditor().value).toBe(original)
    })
  })

  it('refuses to infer from data that does not parse', async () => {
    renderTool(JsonSchemaValidator)
    const original = schemaEditor().value
    fireEvent.change(dataEditor(), { target: { value: '{oops' } })
    fireEvent.click(screen.getByRole('button', { name: /Infer schema/ }))
    await waitFor(() => {
      expect(schemaEditor().value).toBe(original)
    })
    expect(screen.queryByRole('button', { name: /Undo/i })).not.toBeInTheDocument()
  })

  it('generates sample data the current schema accepts', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.click(screen.getByRole('button', { name: 'Sample data' }))
    await waitFor(() => {
      expect(dataEditor().value).toContain('alice@example.com')
    })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Valid/)
    })
  })

  it('drops the undo offer once the user edits by hand', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.click(screen.getByRole('button', { name: 'Sample data' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Undo/i })).toBeInTheDocument()
    })
    fireEvent.change(dataEditor(), { target: { value: '{"name": "edited"}' } })
    expect(screen.queryByRole('button', { name: /Undo/i })).not.toBeInTheDocument()
  })

  it('formats a pane without touching the other one', async () => {
    renderTool(JsonSchemaValidator)
    const schemaBefore = schemaEditor().value
    fireEvent.change(dataEditor(), { target: { value: '{"a":[1,2]}' } })
    // Each pane has its own Format; the first belongs to the data pane.
    fireEvent.click(screen.getAllByRole('button', { name: 'Format' })[0]!)
    await waitFor(() => {
      expect(dataEditor().value).toContain('\n')
    })
    expect(schemaEditor().value).toBe(schemaBefore)
  })

  it('toggles strict mode and reports schema mistakes it catches', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{}' } })
    fireEvent.change(schemaEditor(), {
      target: { value: JSON.stringify({ type: 'object', nonsenseKeyword: true }) },
    })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Valid/)
    })

    const strict = screen.getByRole('button', { name: 'Strict' })
    expect(strict).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(strict)
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/schema is not usable/)
    })
    expect(screen.getByRole('button', { name: 'Strict' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides and shows the problems list', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"name": 5}' } })
    fireEvent.change(schemaEditor(), { target: { value: OBJECT_SCHEMA } })
    await waitFor(() => {
      expect(screen.getByText('/name')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('/name')).not.toBeInTheDocument()
  })

  it('is registered for the file actions it handles', () => {
    // Without the registry flags ⌘O/⌘S, drag-and-drop and the palette entries
    // skip the tool, so its handlers would never fire in the real app.
    expect(supportsToolFileAction('json-schema-validator', 'open-file')).toBe(true)
    expect(supportsToolFileAction('json-schema-validator', 'save-file')).toBe(true)
  })

  it('routes an opened file to the pane it belongs in', async () => {
    renderTool(JsonSchemaValidator)
    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: '{"name": "from disk"}',
        filename: 'payload.json',
      })
    })
    await waitFor(() => {
      expect(dataEditor().value).toContain('from disk')
    })

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: '{"$schema": "http://json-schema.org/draft-07/schema#"}',
        filename: 'anything.json',
      })
    })
    await waitFor(() => {
      expect(schemaEditor().value).toContain('$schema')
    })
    // The data pane keeps what it had: a schema file must not overwrite it.
    expect(dataEditor().value).toContain('from disk')
  })

  it('lets an opened file be undone', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"typed": true}' } })
    act(() => {
      dispatchToolAction({ type: 'open-file', content: '{"disk": 1}', filename: 'payload.json' })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Undo open payload.json/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Undo open payload.json/i }))
    await waitFor(() => {
      expect(dataEditor().value).toBe('{"typed": true}')
    })
  })

  it('saves the pane that was last focused', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/data.json')
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"a": 1}' } })
    act(() => {
      dispatchToolAction({ type: 'save-file' })
    })
    // The Monaco mock never mounts the real editor, so focus tracking cannot
    // run — the default pane is the data one, which is what ⌘S must use.
    await waitFor(() => {
      expect(saveFileDialog).toHaveBeenCalledWith('{"a": 1}', 'data.json')
    })
  })

  it('copies the data buffer on copy-output', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"copy": "me"}' } })
    act(() => {
      dispatchToolAction({ type: 'copy-output' })
    })
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{"copy": "me"}')
    })
  })

  it('revalidates on demand and says so', async () => {
    renderTool(JsonSchemaValidator)
    fireEvent.change(dataEditor(), { target: { value: '{"name": "ok"}' } })
    fireEvent.change(schemaEditor(), { target: { value: OBJECT_SCHEMA } })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Valid/)
    })
    act(() => {
      // Both modifiers: jsdom reports no platform, so the mod key resolves to
      // Ctrl there and to ⌘ in the app.
      fireEvent.keyDown(window, { key: 'Enter', metaKey: true, ctrlKey: true })
    })
    // The verdict is unchanged, so the status message is the only feedback
    // proving the shortcut did anything.
    await waitFor(() => {
      expect(useUiStore.getState().lastAction?.message).toBe('Revalidated')
    })
  })

  describe('loading a schema from a URL', () => {
    beforeEach(() => {
      vi.mocked(tauriFetch).mockReset()
    })

    it('replaces the schema with the fetched document', async () => {
      vi.mocked(tauriFetch).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(OBJECT_SCHEMA),
      } as unknown as Response)
      renderTool(JsonSchemaValidator)
      fireEvent.change(screen.getByLabelText('Schema URL'), {
        target: { value: 'https://json.schemastore.org/thing.json' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Load$/ }))
      await waitFor(() => {
        expect(schemaEditor().value).toContain('"required"')
      })
      // The WebView's own fetch is blocked by CORS on nearly every schema host.
      expect(tauriFetch).toHaveBeenCalled()
    })

    it('rejects a URL that is not http(s) without fetching', async () => {
      renderTool(JsonSchemaValidator)
      fireEvent.change(screen.getByLabelText('Schema URL'), {
        target: { value: 'file:///etc/passwd' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Load$/ }))
      await waitFor(() => {
        expect(useUiStore.getState().lastAction?.message).toBe('Enter an http(s) URL')
      })
      expect(tauriFetch).not.toHaveBeenCalled()
    })

    it('explains a host the app is not allowed to reach', async () => {
      vi.mocked(tauriFetch).mockRejectedValue(new Error('url not allowed on the configured scope'))
      renderTool(JsonSchemaValidator)
      fireEvent.change(screen.getByLabelText('Schema URL'), {
        target: { value: 'https://example.com/s.json' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Load$/ }))
      await waitFor(() => {
        expect(useUiStore.getState().lastAction?.message).toMatch(/not in the app.s allowed list/)
      })
      expect(schemaEditor().value).not.toBe('')
    })
  })
})
