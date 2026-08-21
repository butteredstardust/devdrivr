import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import JsonTools, {
  isTabularJsonArray,
  locateJsonError,
  queryJsonPath,
  normalizeJsonc,
} from '@/tools/json-tools/JsonTools'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

function editor() {
  return screen.getByTestId('monaco-editor') as HTMLTextAreaElement
}

function typeJson(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

function showView(name: 'Source' | 'Tree' | 'Table') {
  fireEvent.click(screen.getByRole('radio', { name }))
}

describe('JsonTools helpers', () => {
  it('normalizes JSONC without stripping comment-like text inside strings', () => {
    const source = '{\n  // note\n  "url": "https://example.com",\n}'
    expect(JSON.parse(normalizeJsonc(source))).toEqual({ url: 'https://example.com' })
    expect(normalizeJsonc(source)).toHaveLength(source.length)
  })

  it('treats only arrays of objects as table-compatible data', () => {
    expect(isTabularJsonArray([{ id: 1 }, { id: 2 }])).toBe(true)
    expect(isTabularJsonArray([1, 2, 3])).toBe(false)
    expect(isTabularJsonArray([{ id: 1 }, null])).toBe(false)
  })

  it('turns a parse position into a line and column', () => {
    const source = '{\n  "a": 1,\n  oops\n}'
    const index = source.indexOf('oops')
    expect(locateJsonError(`Unexpected token o in JSON at position ${index}`, source)).toEqual({
      line: 3,
      column: 3,
    })
    expect(locateJsonError('Expected property name at line 3 column 3', source)).toEqual({
      line: 3,
      column: 3,
    })
  })

  it('locates the error without help from the engine message', () => {
    // JavaScriptCore — the engine in the shipped WKWebView — reports neither a
    // position nor a line/column, so the source has to be scanned instead.
    expect(
      locateJsonError('JSON Parse error: Property name must be a string literal', '{\n  oops\n}')
    ).toEqual({
      line: 2,
      column: 3,
    })
    expect(locateJsonError('JSON Parse error: Unexpected EOF', '{"a":')).toEqual({
      line: 1,
      column: 5,
    })
    // The unescaped newline is where the string stops being legal.
    expect(locateJsonError('JSON Parse error: Unterminated string', '{\n  "a": "oops\n}')).toEqual({
      line: 2,
      column: 13,
    })
  })

  it('distinguishes a null value from a missing path', () => {
    const data = { a: { b: null }, list: [{ id: 7 }] }
    // The old signature returned `undefined` for both, so a legitimate null
    // read as "No match".
    expect(queryJsonPath(data, '$.a.b')).toEqual({ found: true, value: null })
    expect(queryJsonPath(data, '$.a.missing')).toEqual({ found: false })
    expect(queryJsonPath(data, '$.list[0].id')).toEqual({ found: true, value: 7 })
  })
})

describe('JsonTools', () => {
  beforeEach(() => {
    recordMock.mockClear()
    vi.mocked(saveFileDialog).mockReset()
    useUiStore.setState({ lastAction: null })
  })

  it('keeps the source editor and the inspector on screen together', () => {
    renderTool(JsonTools)
    typeJson('{"a": 1}')
    showView('Tree')

    // The inspector used to be a tab that replaced the editor, so fixing a
    // document meant leaving the view that showed the problem.
    expect(screen.getByRole('region', { name: 'JSON source' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tree view' })).toBeInTheDocument()
    expect(editor()).toHaveValue('{"a": 1}')
  })

  it('reports validity and document shape in a live region', () => {
    renderTool(JsonTools)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to inspect yet')

    typeJson('{"a": 1, "b": {"c": 2}}')
    expect(screen.getByRole('status')).toHaveTextContent(/Valid JSON · 3 keys · depth 2/)
  })

  it('points at the line and column of a syntax error', () => {
    renderTool(JsonTools)
    typeJson('{\n  "a": 1,\n  oops\n}')

    expect(screen.getByRole('status')).toHaveTextContent('Invalid JSON — line 3, column 3')
    expect(screen.getByRole('button', { name: /Go to error/ })).toBeInTheDocument()
  })

  it('disables the reshaping actions while the document does not parse', () => {
    renderTool(JsonTools)
    typeJson('{"a":')

    expect(screen.getByRole('button', { name: 'Minify' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Sort keys/ })).toBeDisabled()
  })

  it('minifies and sorts keys through the editor buffer', () => {
    renderTool(JsonTools)
    typeJson('{\n  "b": 1,\n  "a": 2\n}')

    fireEvent.click(screen.getByRole('button', { name: /Sort keys/ }))
    expect(editor().value).toBe('{\n  "a": 2,\n  "b": 1\n}')

    fireEvent.click(screen.getByRole('button', { name: 'Minify' }))
    expect(editor()).toHaveValue('{"a":2,"b":1}')
  })

  it('runs a path query and separates a null hit from a miss', () => {
    renderTool(JsonTools)
    typeJson('{"a": {"b": null}}')
    fireEvent.click(screen.getByRole('button', { name: 'Path' }))

    fireEvent.change(screen.getByLabelText('JSON path'), { target: { value: '$.a.b' } })
    expect(screen.getByText('null')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('JSON path'), { target: { value: '$.a.zzz' } })
    expect(screen.getByText('No match for this path')).toBeInTheDocument()
  })

  it('tabulates an array of primitives by index instead of refusing to render', () => {
    renderTool(JsonTools)
    typeJson('[1,2,3]')
    showView('Table')

    const table = within(screen.getByRole('region', { name: 'Table view' }))
    expect(table.getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['0', '1', '2'])
    expect(table.getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '2', '3'])
  })

  it('tabulates a nested object document all the way down', () => {
    renderTool(JsonTools)
    typeJson(
      '{"properties":{"age":{"minimum":0,"type":"integer"},"name":{"type":"string"}},"required":["name"],"type":"object"}'
    )
    showView('Table')

    const table = within(screen.getByRole('region', { name: 'Table view' }))
    // Top-level keys become row headers, and so do the keys of every nested object.
    const headers = table.getAllByRole('rowheader').map((h) => h.textContent)
    expect(headers).toEqual(
      expect.arrayContaining(['properties', 'required', 'type', 'age', 'name', 'minimum'])
    )
    expect(screen.getByText('3 fields')).toBeInTheDocument()
  })

  it('copies a leaf value from a nested table with the keyboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(JsonTools)
    typeJson('{"type":"object"}')
    showView('Table')

    const table = within(screen.getByRole('region', { name: 'Table view' }))
    fireEvent.click(table.getByRole('button', { name: 'Copy value object' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('object'))
  })

  it('marks a key missing from one record apart from a null value', () => {
    renderTool(JsonTools)
    // A mixed array is not a record list, so it lands in the nested renderer.
    typeJson('[{"a":1},[{"a":null},{"b":2}]]')
    showView('Table')

    const table = within(screen.getByRole('region', { name: 'Table view' }))
    // Row 0 has no "b", row 1 has no "a".
    expect(table.getAllByText('—')).toHaveLength(2)
    expect(table.getByText('null')).toBeInTheDocument()
  })

  it('asks before rendering a table for a document too large to open collapsed', () => {
    renderTool(JsonTools)
    // The tree opens collapsed above 500 keys; the table has no equivalent, so it
    // would otherwise mount a DOM node per key the instant the view is selected.
    const rows = Array.from({ length: 300 }, (_, i) => ({ a: i, b: i }))
    typeJson(JSON.stringify(rows))
    showView('Table')

    const pane = within(screen.getByRole('region', { name: 'Table view' }))
    expect(pane.getByText('Large document')).toBeInTheDocument()
    expect(pane.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(pane.getByRole('button', { name: 'Render anyway' }))
    expect(pane.getByRole('table')).toBeInTheDocument()
  })

  it('stops nesting tables at a fixed depth instead of recursing without a bound', () => {
    renderTool(JsonTools)
    // 40 levels of nesting: unbounded, this recurses once per level during render,
    // and a deep enough document takes the app down rather than just the pane.
    let deep = JSON.stringify({ leaf: 1 })
    for (let i = 0; i < 40; i += 1) deep = `{"a":${deep}}`
    typeJson(deep)
    showView('Table')

    // Deep but narrow: 41 keys, so the large-document prompt does not apply.
    const pane = within(screen.getByRole('region', { name: 'Table view' }))
    // The tail below the cap is printed as compact JSON, so nothing is hidden.
    expect(pane.getAllByRole('table')).toHaveLength(20)
    expect(pane.getByRole('button', { name: /^Copy value \{"a":/ })).toBeInTheDocument()
  })

  it('sorts table columns and exposes the direction to assistive tech', () => {
    renderTool(JsonTools)
    typeJson('[{"name":"b","qty":2},{"name":"a","qty":10}]')
    showView('Table')

    const table = within(screen.getByRole('region', { name: 'Table view' }))
    fireEvent.click(table.getByRole('button', { name: /name/ }))

    expect(table.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'ascending')
    expect(table.getAllByRole('cell')[0]).toHaveTextContent('a')

    fireEvent.click(table.getByRole('button', { name: /name/ }))
    expect(table.getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'descending')
    expect(table.getAllByRole('cell')[0]).toHaveTextContent('b')
  })

  it('makes table cells reachable and copyable from the keyboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(JsonTools)
    typeJson('[{"name":"ada","qty":2}]')
    showView('Table')

    // Only the cursor cell is in the tab order; the old grid had no tab stop
    // at all and copied on click only.
    const cells = within(screen.getByRole('region', { name: 'Table view' })).getAllByRole('cell')
    expect(cells[0]).toHaveAttribute('tabindex', '0')
    expect(cells[1]).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(cells[0]!, { key: 'ArrowRight' })
    fireEvent.keyDown(cells[0]!, { key: 'Enter' })
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('2'))
  })

  it('collapses the tree by default for a large document', () => {
    renderTool(JsonTools)
    const big = JSON.stringify(
      Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, i]))
    )
    typeJson(big)
    showView('Tree')

    expect(screen.getByText(/Collapsed — 600 keys/)).toBeInTheDocument()
    expect(screen.queryByText('"k0"')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand all/ }))
    expect(screen.getByText('"k0"')).toBeInTheDocument()
  })

  it('drops the failed-format banner as soon as the document is edited', async () => {
    renderTool(JsonTools)
    typeJson('{"a": }')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()

    // Otherwise the red banner keeps contradicting a status line that has gone
    // back to "Valid JSON".
    typeJson('{"a": 1}')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not record history just because valid JSON was edited', () => {
    renderTool(JsonTools)
    typeJson('{"a": 1}')
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('opens a file and saves the current editor content', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/data.json')
    renderTool(JsonTools)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: '{"opened":true}',
        filename: 'opened.json',
      })
    })
    expect(editor()).toHaveValue('{"opened":true}')
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened opened.json' })

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith('{"opened":true}', 'opened.json')
    )
  })

  it('does not open a save dialog for an empty buffer', () => {
    renderTool(JsonTools)
    act(() => dispatchToolAction({ type: 'save-file' }))

    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Nothing to save yet' })
  })

  it('surfaces save failures without clearing JSON input', async () => {
    vi.mocked(saveFileDialog).mockRejectedValue(new Error('disk full'))
    renderTool(JsonTools)
    typeJson('{"safe":true}')

    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledOnce())
    expect(editor()).toHaveValue('{"safe":true}')
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Save failed: disk full',
      type: 'error',
    })
  })

  // This bar wraps to two rows at 1024px. With view options first the wrap put Indent/Path/view
  // mode on row one and buried every primary action beneath them, so the least important row has
  // to be the one that sheds last. Save is labelled for the same reason Copy JSON is — an
  // unlabelled floppy disk next to five labelled buttons reads as a different class of control.
  it('leads the toolbar with document actions and trails with view options', () => {
    renderTool(JsonTools)
    const actions = screen.getByRole('group', { name: 'Document actions' })
    const viewOptions = screen.getByRole('group', { name: 'View options' })

    expect(
      actions.compareDocumentPosition(viewOptions) & actions.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(within(actions).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('offers a sample only while the document is empty', () => {
    renderTool(JsonTools)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    expect(editor().value).toContain('"customer": "Ada Lovelace"')
    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Valid JSON/)
  })
})
