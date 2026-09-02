import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import CsvTools from '@/tools/csv-tools/CsvTools'
import {
  countDuplicateRows,
  detectDelimiter,
  generateSql,
  generateTypeScript,
  outputFileName,
  parseCsv,
  parseJsonRows,
  summarizeColumns,
  toOutput,
} from '@/tools/csv-tools/csv-helpers'
import { renderTool } from '@/tools/__tests__/test-utils'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

const SAMPLE = 'name,age\nAlice,30\nBob,25'

function editor() {
  return screen.getAllByTestId('monaco-editor')[0] as HTMLTextAreaElement
}

function typeCsv(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

function showView(name: 'Table' | 'Convert' | 'Analyze') {
  fireEvent.click(screen.getByRole('radio', { name }))
}

const parseOptions = { delimiter: 'auto' as const, hasHeader: true, typed: false }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('csv-helpers', () => {
  it('detects the delimiter from consistency across lines, not the first line', () => {
    // `name,description` used to win over the real separator because the first
    // description happened to contain commas.
    const text = 'name;description\nA;"one, two, three"\nB;"four, five, six"'

    expect(detectDelimiter(text)).toBe(';')
  })

  it('ignores separators inside quoted fields', () => {
    expect(detectDelimiter('a,b\n"x,y",z')).toBe(',')
  })

  it('distinguishes empty input from parsed input', () => {
    expect(parseCsv('   ', parseOptions)).toEqual({ status: 'empty' })
    expect(parseCsv(SAMPLE, parseOptions).status).toBe('parsed')
  })

  it('accepts JSON arrays of records as table input', () => {
    const result = parseJsonRows('[{"name":"Alice","age":30},{"name":"Bob"}]')
    expect(result).toMatchObject({ status: 'parsed', columns: ['name', 'age'] })
    if (result.status === 'parsed') expect(result.rows[1]).toEqual({ name: 'Bob', age: null })
  })

  it('keeps the extra fields of a ragged row instead of dropping them', () => {
    const result = parseCsv('a,b\n1,2,3', parseOptions)

    expect(result.status).toBe('parsed')
    if (result.status !== 'parsed') return
    // Papa's header mode silently discarded the third field.
    expect(result.columns).toEqual(['a', 'b', 'Column 3'])
    expect(result.rows[0]).toEqual({ a: '1', b: '2', 'Column 3': '3' })
  })

  it('reports the source line of a short row so it can be jumped to', () => {
    const result = parseCsv('a,b\n1,2\n3', parseOptions)

    expect(result.status).toBe('parsed')
    if (result.status !== 'parsed') return
    // Header on line 1, first data row on line 2, the short row on line 3.
    expect(result.issues.some((issue) => issue.line === 3)).toBe(true)
  })

  it('flags only the odd row, not every other row in the file', () => {
    // Measuring against the widest row made one overlong row turn every
    // well-formed row into an issue.
    const result = parseCsv('a,b\n1,2\n3,4\n5,6,7', parseOptions)

    expect(result.status).toBe('parsed')
    if (result.status !== 'parsed') return
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.line).toBe(4)
  })

  it('disambiguates repeated header names instead of overwriting them', () => {
    const result = parseCsv('id,id\n1,2', parseOptions)

    expect(result.status).toBe('parsed')
    if (result.status !== 'parsed') return
    expect(result.columns).toEqual(['id', 'id (2)'])
    expect(result.rows[0]).toEqual({ id: '1', 'id (2)': '2' })
  })

  it('names columns positionally when there is no header row', () => {
    const result = parseCsv('1,2', { ...parseOptions, hasHeader: false })

    expect(result.status).toBe('parsed')
    if (result.status !== 'parsed') return
    expect(result.columns).toEqual(['Column 1', 'Column 2'])
  })

  it('leaves values as text unless typing is asked for', () => {
    const untyped = parseCsv('zip,n\n007,1', parseOptions)
    const typed = parseCsv('zip,n\n007,1', { ...parseOptions, typed: true })

    expect(untyped.status === 'parsed' && untyped.rows[0]?.zip).toBe('007')
    // Even with typing on, a leading zero is a code, not a number to be shortened.
    expect(typed.status === 'parsed' && typed.rows[0]?.zip).toBe('007')
    expect(typed.status === 'parsed' && typed.rows[0]?.n).toBe(1)
  })

  it('converts to each output format', () => {
    const parsed = parseCsv(SAMPLE, parseOptions)
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    const { columns, rows } = parsed

    expect(JSON.parse(toOutput(columns, rows, 'json-rows'))).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
    expect(JSON.parse(toOutput(columns, rows, 'json-columns'))).toEqual({
      name: ['Alice', 'Bob'],
      age: ['30', '25'],
    })
    expect(toOutput(columns, rows, 'tsv')).toBe('name\tage\nAlice\t30\nBob\t25')
    expect(toOutput(columns, rows, 'markdown').split('\n')[1]).toBe('| --- | --- |')
    expect(toOutput(columns, rows, 'sql', 'people')).toContain(
      `INSERT INTO "people" ("name", "age") VALUES ('Alice', '30');`
    )
    expect(toOutput(columns, rows, 'yaml')).toContain('name: Alice')
  })

  it('escapes values that would otherwise break their format', () => {
    const columns = ['a']
    const rows = [{ a: "pipe | quote ' newline\nend" }]

    expect(toOutput(columns, rows, 'markdown')).toContain('\\|')
    expect(toOutput(columns, rows, 'markdown')).not.toContain('\nend')
    expect(toOutput(columns, rows, 'sql')).toContain("quote ''")
    expect(toOutput(columns, rows, 'tsv')).not.toContain('\nend')
  })

  it('reports the source line, not the record index, past blank lines', () => {
    const parsed = parseCsv('a,b\n1,2\n\n3\n', parseOptions)

    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.issues[0]?.line).toBe(4)
  })

  it('counts a newline inside a quoted field as part of one record', () => {
    const parsed = parseCsv('a,b\n1,"line\nbreak"\n2\n', parseOptions)

    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]?.b).toBe('line\nbreak')
    expect(parsed.issues[0]?.line).toBe(4)
  })

  it('keeps line numbers aligned past a quoted-empty line', () => {
    // Papa drops `""` as an empty line; the line counter has to drop it too.
    const parsed = parseCsv('a,b\n1,2\n""\n3\n', parseOptions)

    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.issues[0]?.line).toBe(4)
  })

  it('detects the delimiter most records agree on, ignoring a title row', () => {
    expect(detectDelimiter('Quarterly report, final\na;b;c\n1;2;3\n4;5;6')).toBe(';')
  })

  it('summarises numbers and text separately', () => {
    const parsed = parseCsv('n,label\n1,a\n3,a\n,b', { ...parseOptions, typed: true })
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    const [numbers, labels] = summarizeColumns(parsed.columns, parsed.rows)

    expect(numbers?.type).toBe('number')
    expect(numbers?.numeric).toMatchObject({ min: 1, max: 3, mean: 2, median: 2, sum: 4 })
    expect(numbers?.blanks).toBe(1)
    expect(labels?.type).toBe('string')
    expect(labels?.unique).toBe(2)
    expect(labels?.text?.mode).toBe('a')
  })

  it('calls a column with one stray value mixed rather than numeric', () => {
    const values = [1, 2, 'n/a']

    // 95% numeric is still a column with something else in it, and that
    // something is usually the interesting part of the file.
    expect(
      summarizeColumns(
        ['n'],
        values.map((n) => ({ n }))
      )[0]?.type
    ).toBe('mixed')
  })

  it('counts rows that repeat every cell', () => {
    expect(countDuplicateRows(['a'], [{ a: '1' }, { a: '1' }, { a: '2' }])).toBe(1)
  })

  it('generates a TypeScript interface that admits blanks', () => {
    const parsed = parseCsv('id,note\n1,\n2,hi', { ...parseOptions, typed: true })
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return

    const ts = generateTypeScript(summarizeColumns(parsed.columns, parsed.rows))

    expect(ts).toContain('id: number;')
    expect(ts).toContain('note: string | null;')
  })

  it('quotes identifiers that are not plain names', () => {
    const parsed = parseCsv('first name,order\nA,1', parseOptions)
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return
    const summaries = summarizeColumns(parsed.columns, parsed.rows)

    expect(generateTypeScript(summaries)).toContain('"first name": string')
    expect(generateSql(summaries, 'people')).toContain('"first name" TEXT NOT NULL')
  })

  it('names an export after the source, with the format extension', () => {
    expect(outputFileName('report.csv', 'json')).toBe('report.json')
    expect(outputFileName(null, 'csv')).toBe('data.csv')
  })
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('CsvTools', () => {
  beforeEach(() => {
    recordMock.mockReset()
    vi.mocked(saveFileDialog).mockReset()
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/out.csv')
    useUiStore.setState({ lastAction: null })
  })

  it('is registered for the file actions it handles', () => {
    // Without the registry flag ⌘S skips the tool, so its save-file handling
    // would never fire in the real app.
    expect(supportsToolFileAction('csv-tools', 'open-file')).toBe(true)
    expect(supportsToolFileAction('csv-tools', 'save-file')).toBe(true)
  })

  it('keeps the source editor and the active pane on screen together', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)

    expect(screen.getByRole('region', { name: 'CSV source' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('region', { name: 'Table view' })).toBeVisible())
    expect(editor()).toHaveValue(SAMPLE)
  })

  it('describes the parse in the status line, including the detected delimiter', async () => {
    renderTool(CsvTools)
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Nothing to parse yet')

    typeCsv('a;b\n1;2')

    await waitFor(() =>
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(
        /1 row · 2 columns · semicolon-separated \(detected\)/
      )
    )
  })

  it('keeps the delimiter override reachable in every view', () => {
    renderTool(CsvTools)
    for (const view of ['Table', 'Convert', 'Analyze'] as const) {
      showView(view)
      expect(screen.getByLabelText('Delimiter')).toBeInTheDocument()
    }
  })

  it('reports ragged rows and offers to jump to the first one', async () => {
    renderTool(CsvTools)
    typeCsv('a,b\n1,2\n3')

    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent(/1 issue/))
    expect(screen.getByRole('button', { name: /Go to issue/ })).toBeInTheDocument()
  })

  it('loads a sample into an empty editor and lets it be undone', () => {
    renderTool(CsvTools)

    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))
    expect(editor().value).toContain('Ada Lovelace')

    fireEvent.click(screen.getByRole('button', { name: /Undo load sample/i }))
    expect(editor()).toHaveValue('')
  })

  it('sorts the table by a column from the keyboard', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)

    const header = await screen.findByRole('columnheader', { name: 'name' })
    // Sorting used to be a click handler on the <th>, unreachable by keyboard
    // and invisible to screen readers.
    fireEvent.click(within(header).getByRole('button'))

    await waitFor(() => expect(header).toHaveAttribute('aria-sort', 'ascending'))
  })

  it('filters table rows without touching the source', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)

    const filter = await screen.findByLabelText('Filter rows')
    fireEvent.change(filter, { target: { value: 'Alice' } })

    const table = screen.getByRole('region', { name: 'Table view' })
    await waitFor(() => expect(within(table).queryByText('Bob')).not.toBeInTheDocument())
    expect(within(table).getByText('Alice')).toBeInTheDocument()
    expect(editor()).toHaveValue(SAMPLE)
  })

  it('converts to the selected format in the pane beside the source', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)
    showView('Convert')

    const format = await screen.findByLabelText('Output format')
    fireEvent.change(format, { target: { value: 'markdown' } })

    await waitFor(() => {
      const output = screen.getAllByTestId('monaco-editor')[1] as HTMLTextAreaElement
      expect(output.value).toContain('| name | age |')
    })
  })

  it('shows the generated schema instead of only copying it', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)
    showView('Analyze')

    fireEvent.click(await screen.findByRole('button', { name: /Generated schema/ }))

    await waitFor(() => expect(screen.getByText(/interface CsvRow/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('radio', { name: 'SQL' }))
    await waitFor(() => expect(screen.getByText(/CREATE TABLE/)).toBeInTheDocument())
  })

  it('opens each analysis panel independently', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)
    showView('Analyze')

    const stats = await screen.findByRole('button', { name: /Column statistics/ })
    const quality = screen.getByRole('button', { name: /Data quality/ })
    fireEvent.click(quality)

    // The old accordion kept one open panel in a three-valued state with two
    // panels, so opening one collapsed everything.
    expect(stats).toHaveAttribute('aria-expanded', 'true')
    expect(quality).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens a file into the buffer, remembering its name and keeping an undo', async () => {
    renderTool(CsvTools)
    typeCsv('old,data\n1,2')

    act(() => dispatchToolAction({ type: 'open-file', content: SAMPLE, filename: 'people.csv' }))

    expect(editor()).toHaveValue(SAMPLE)
    await waitFor(() => expect(screen.getByText('people.csv')).toBeInTheDocument())

    // Replacing the buffer is exactly where Monaco's own undo stack does not help.
    fireEvent.click(screen.getByRole('button', { name: /Undo open people.csv/i }))
    expect(editor()).toHaveValue('old,data\n1,2')
  })

  it('saves the active view, not always the source', async () => {
    renderTool(CsvTools)
    act(() => dispatchToolAction({ type: 'open-file', content: SAMPLE, filename: 'people.csv' }))
    showView('Convert')

    await waitFor(() => expect(screen.getAllByTestId('monaco-editor').length).toBeGreaterThan(1))
    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith(expect.stringContaining('"name"'), 'people.json')
    )
  })

  it('saves what is in the editor now, not the last debounced parse', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)
    showView('Convert')
    await waitFor(() => expect(screen.getAllByTestId('monaco-editor').length).toBeGreaterThan(1))

    // No wait: ⌘S lands inside the 250 ms debounce window, which used to write
    // the previous buffer's conversion.
    typeCsv('city\nOslo')
    act(() => dispatchToolAction({ type: 'save-file' }))

    await waitFor(() =>
      expect(saveFileDialog).toHaveBeenCalledWith(expect.stringContaining('Oslo'), 'data.json')
    )
  })

  it('saves the table view verbatim, keeping ragged rows and leading zeroes', async () => {
    const source = 'id,name\n007,Bond\n1,Extra,field'
    renderTool(CsvTools)
    typeCsv(source)

    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent(/1 issue/))
    act(() => dispatchToolAction({ type: 'save-file' }))

    // Re-serialising the parsed rows would drop `field` and rewrite `007`.
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith(source, 'data.csv'))
  })

  it('restores the file name along with the buffer when undoing', async () => {
    renderTool(CsvTools)
    act(() => dispatchToolAction({ type: 'open-file', content: SAMPLE, filename: 'people.csv' }))
    await waitFor(() => expect(screen.getByText('people.csv')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Undo open people.csv/i }))

    // Otherwise ⌘S offers to overwrite the file whose contents are gone.
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('names the SQL inserts after the same table as the generated schema', () => {
    const parsed = parseCsv('id,name\n1,Ada', parseOptions)
    expect(parsed.status).toBe('parsed')
    if (parsed.status !== 'parsed') return

    // Inserts into `csv_data` will not run against a `people` table.
    expect(toOutput(parsed.columns, parsed.rows, 'sql', 'people')).toContain('INSERT INTO "people"')
  })

  it('records the first CSV the user pastes, and the flagged ones as failures', async () => {
    renderTool(CsvTools)
    typeCsv(SAMPLE)

    // The guard that keeps a restored buffer out of the history used to
    // swallow the first paste with it.
    await waitFor(() =>
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ output: '2 rows × 2 columns', success: true })
      )
    )

    typeCsv('a,b\n1,2\n3')
    await waitFor(() =>
      expect(recordMock).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('1 issue') })
      )
    )
  })

  it('copies the active view and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderTool(CsvTools)
    typeCsv(SAMPLE)

    await waitFor(() => expect(screen.getByRole('region', { name: 'Table view' })).toBeVisible())
    act(() => dispatchToolAction({ type: 'copy-output' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Alice')))
    await waitFor(() => expect(useUiStore.getState().lastAction?.message).toBe('Copied output'))
  })

  it('says there is nothing to copy rather than failing silently', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderTool(CsvTools)

    act(() => dispatchToolAction({ type: 'copy-output' }))

    await waitFor(() =>
      expect(useUiStore.getState().lastAction?.message).toBe('Nothing to copy yet')
    )
    expect(writeText).not.toHaveBeenCalled()
  })
})
