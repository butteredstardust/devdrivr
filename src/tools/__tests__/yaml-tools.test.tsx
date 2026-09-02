import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import YamlTools from '@/tools/yaml-tools/YamlTools'
import {
  documentsToJson,
  hasUnpreservableSyntax,
  jsonToYaml,
  parseYamlStream,
  sortKeysDeep,
  stringifyYaml,
  stringifyYamlStream,
} from '@/tools/yaml-tools/yaml-helpers'
import { renderTool } from '@/tools/__tests__/test-utils'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

/** The source editor — the JSON pane renders a second Monaco beside it. */
function editor() {
  return screen.getAllByTestId('monaco-editor')[0] as HTMLTextAreaElement
}

function typeYaml(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

function showView(name: 'Source' | 'Tree' | 'JSON') {
  fireEvent.click(screen.getByRole('radio', { name }))
}

const SAMPLE = 'name: Alice\nage: 30\n'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('yaml-helpers', () => {
  it('distinguishes an empty document from an invalid one', () => {
    // The old parser reported empty input as the error "Input is empty", so an
    // untouched tool looked broken.
    expect(parseYamlStream('   ')).toEqual({ status: 'empty' })
    expect(parseYamlStream('key: [unclosed').status).toBe('invalid')
  })

  it('reports where a parse error is, 1-based for the editor', () => {
    const result = parseYamlStream('a: 1\nb: [unclosed\n')

    expect(result.status).toBe('invalid')
    if (result.status !== 'invalid') return
    expect(result.location?.line).toBeGreaterThanOrEqual(2)
    expect(result.location?.column).toBeGreaterThanOrEqual(1)
    expect(result.message).toBeTruthy()
  })

  it('parses a multi-document stream instead of rejecting it', () => {
    // `yaml.load` throws "expected a single document in the stream" on `---`,
    // which is most Kubernetes manifests.
    const result = parseYamlStream('kind: A\n---\nkind: B\n')

    expect(result).toEqual({ status: 'valid', documents: [{ kind: 'A' }, { kind: 'B' }] })
  })

  it('round-trips a multi-document stream', () => {
    const yaml = stringifyYamlStream([{ kind: 'A' }, { kind: 'B' }])

    expect(yaml).toContain('---')
    expect(parseYamlStream(yaml)).toEqual({
      status: 'valid',
      documents: [{ kind: 'A' }, { kind: 'B' }],
    })
  })

  it('flags source whose comments and anchors a dump would drop', () => {
    expect(hasUnpreservableSyntax('a: 1 # why\n')).toBe(true)
    expect(hasUnpreservableSyntax('base: &ref\n  a: 1\nuse: *ref\n')).toBe(true)
    expect(hasUnpreservableSyntax('a: 1\nb: two\n')).toBe(false)
  })

  it('keeps a single document an object and a stream an array in JSON', () => {
    expect(documentsToJson([{ a: 1 }])).toBe('{\n  "a": 1\n}')
    expect(JSON.parse(documentsToJson([{ a: 1 }, { b: 2 }]))).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('sorts keys at every level and leaves array order alone', () => {
    const sorted = sortKeysDeep({ z: { b: 2, a: 1 }, a: 0 }) as Record<string, unknown>

    expect(Object.keys(sorted)).toEqual(['a', 'z'])
    expect(Object.keys(sorted['z'] as object)).toEqual(['a', 'b'])
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })

  it('treats a YAML null document as a value, not a failure', () => {
    expect(parseYamlStream('null')).toEqual({ status: 'valid', documents: [null] })
    expect(documentsToJson([null])).toBe('null')
    expect(jsonToYaml('null')).toBe('null\n')
  })

  it('serialises objects and sequences', () => {
    expect(stringifyYaml({ name: 'Alice', age: 30 })).toContain('name: Alice')
    expect(stringifyYaml(['a', 'b'])).toContain('- a')
  })

  it('rejects JSON it cannot parse with a message naming the problem', () => {
    expect(() => jsonToYaml('')).toThrow('empty')
    expect(() => jsonToYaml('{invalid: json}')).toThrow('Invalid JSON')
  })
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('YamlTools', () => {
  beforeEach(() => {
    vi.mocked(saveFileDialog).mockReset()
    useUiStore.setState({ lastAction: null })
  })

  it('is registered for the file actions it handles', () => {
    // Without the registry flags ⌘O/⌘S and the palette entries skip the tool,
    // so its open-file/save-file handling would never fire in the real app.
    expect(supportsToolFileAction('yaml-tools', 'open-file')).toBe(true)
    expect(supportsToolFileAction('yaml-tools', 'save-file')).toBe(true)
  })

  it('keeps the source editor and the inspector on screen together', () => {
    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('Tree')

    // Tree and JSON used to be tabs that replaced the editor, so inspecting a
    // document meant leaving it.
    expect(screen.getByRole('region', { name: 'YAML source' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tree view' })).toBeInTheDocument()
    expect(editor()).toHaveValue(SAMPLE)
  })

  it('validates as you type and describes the document shape', async () => {
    renderTool(YamlTools)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to inspect yet')

    typeYaml(SAMPLE)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Valid YAML · 2 keys · depth 1/)
    )
  })

  it('counts the documents in a multi-document stream', async () => {
    renderTool(YamlTools)
    typeYaml('kind: A\n---\nkind: B\n')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Valid YAML · 2 documents/)
    )
  })

  it('points at the line of a parse error and offers to jump to it', async () => {
    renderTool(YamlTools)
    typeYaml('a: 1\nb: [unclosed\n')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Invalid YAML — .*line \d+, column \d+/)
    )
    expect(screen.getByRole('button', { name: /Go to error/ })).toBeInTheDocument()
  })

  it('formats through the editor buffer', async () => {
    renderTool(YamlTools)
    typeYaml('name:    Alice\n')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))

    await waitFor(() => expect(editor()).toHaveValue('name: Alice\n'))
  })

  it('sorts keys and lets the result be undone', () => {
    renderTool(YamlTools)
    typeYaml('b: 2\na: 1\n')

    fireEvent.click(screen.getByRole('button', { name: /Sort keys/ }))
    expect(editor().value.indexOf('a: 1')).toBeLessThan(editor().value.indexOf('b: 2'))

    // Reshaping is lossy, so undo must not depend on Monaco's history.
    fireEvent.click(screen.getByRole('button', { name: /Undo sorted keys/i }))
    expect(editor()).toHaveValue('b: 2\na: 1\n')
  })

  it('says so when a reshaping action drops comments', () => {
    renderTool(YamlTools)
    typeYaml('# keep me\nb: 2\na: 1\n')

    fireEvent.click(screen.getByRole('button', { name: /Sort keys/ }))

    // js-yaml cannot round-trip comments; losing one silently is the kind of
    // thing you only notice in review.
    expect(useUiStore.getState().lastAction?.message).toMatch(/not preserved/)
  })

  it('withdraws the undo offer once the document is edited by hand', () => {
    renderTool(YamlTools)
    typeYaml('b: 2\na: 1\n')
    fireEvent.click(screen.getByRole('button', { name: /Sort keys/ }))

    // Reverting to a snapshot older than the last few minutes of typing would
    // throw that typing away.
    typeYaml('b: 2\na: 1\nc: 3\n')

    expect(screen.queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
  })

  it('reshapes what is in the buffer, not what was last parsed', () => {
    renderTool(YamlTools)
    typeYaml('b: 2\na: 1\n')
    // Parsing is debounced; a click inside that window must still act on the
    // current text.
    typeYaml('z: 26\ny: 25\n')

    fireEvent.click(screen.getByRole('button', { name: /Sort keys/ }))

    expect(editor().value).not.toContain('b: 2')
    expect(editor().value.indexOf('y: 25')).toBeLessThan(editor().value.indexOf('z: 26'))
  })

  it('converts to JSON without waiting for a Convert click', async () => {
    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('JSON')

    // The old pane threw its output away on every keystroke and demanded a
    // click to rebuild it.
    await waitFor(() => {
      const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
      expect(panes[1]?.value).toContain('"name": "Alice"')
    })
  })

  it('applies edited JSON back to the YAML document', () => {
    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('JSON')

    const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    fireEvent.change(panes[1]!, { target: { value: '{"name":"Bob"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to YAML' }))

    // The JSON → YAML direction used to live in a tab with a second buffer that
    // drifted out of sync with the one being edited.
    expect(editor().value).toContain('name: Bob')
  })

  it('keeps a stream a stream when JSON is applied back', async () => {
    renderTool(YamlTools)
    typeYaml('kind: A\n---\nkind: B\n')
    showView('JSON')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/2 documents/))

    const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    fireEvent.change(panes[1]!, { target: { value: '[{"kind":"A"},{"kind":"C"}]' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to YAML' }))

    // Dumping the JSON array as one document would turn two documents into a
    // single sequence — a different document.
    expect(editor().value).toContain('---')
    expect(editor().value).toContain('kind: C')
  })

  it('keeps an unapplied JSON edit across a view switch', () => {
    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('JSON')

    const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    fireEvent.change(panes[1]!, { target: { value: '{"name":"Bob"}' } })
    showView('Source')
    showView('JSON')

    const after = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    expect(after[1]?.value).toBe('{"name":"Bob"}')
    expect(screen.getByText('Edited — not applied')).toBeInTheDocument()
  })

  it('refuses to apply JSON it cannot parse', () => {
    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('JSON')

    const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
    fireEvent.change(panes[1]!, { target: { value: '{not json' } })

    expect(screen.getByRole('button', { name: 'Apply to YAML' })).toBeDisabled()
    expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument()
  })

  it('explains an invalid document in the tree instead of showing an empty pane', async () => {
    renderTool(YamlTools)
    typeYaml('a: 1\nb: [unclosed\n')
    showView('Tree')

    const pane = within(screen.getByRole('region', { name: 'Tree view' }))
    await waitFor(() => expect(pane.getByText('Invalid YAML')).toBeInTheDocument())
  })

  it('gives every tree row a label so it can be copied from the keyboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(YamlTools)
    typeYaml(SAMPLE)
    showView('Tree')

    // The label quotes strings, so a quoted "30" is distinguishable from 30.
    fireEvent.click(await screen.findByRole('button', { name: 'Copy value "Alice"' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Alice'))

    fireEvent.click(screen.getByRole('button', { name: 'Copy path $' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('$'))
  })

  it('opens a file and saves the current editor content', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/doc.yaml')
    renderTool(YamlTools)

    act(() => {
      dispatchToolAction({ type: 'open-file', content: SAMPLE, filename: 'config.yaml' })
    })
    expect(editor()).toHaveValue(SAMPLE)
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened config.yaml' })

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith(SAMPLE, 'config.yaml'))
  })

  it('does not open a save dialog for an empty buffer', () => {
    renderTool(YamlTools)
    act(() => dispatchToolAction({ type: 'save-file' }))

    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Nothing to save yet' })
  })

  it('offers a sample only while the document is empty', () => {
    renderTool(YamlTools)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    expect(editor().value).toContain('service: devdrivr')
    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
  })
})
