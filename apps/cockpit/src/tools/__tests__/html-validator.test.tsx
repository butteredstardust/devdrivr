import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { useToolStateCache } from '@/stores/tool-state.store'
import HtmlValidator from '@/tools/html-validator/HtmlValidator'
import {
  ALL_RULES,
  buildRuleset,
  computeStats,
  countIssues,
  countRuleOverrides,
  isRuleEnabled,
  outlineProblems,
  ruleById,
  sortIssues,
  templateById,
  toggleRule,
  TEMPLATES,
  type HtmlIssue,
} from '@/tools/html-validator/html-helpers'
import { openFileDialog, saveFileDialog } from '@/lib/file-io'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
}))

afterEach(() => {
  vi.clearAllMocks()
})

function typeHtml(html: string) {
  fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: html } })
}

/** Stands in for a session persisted by an earlier version of the tool. */
function seedToolState(saved: Record<string, unknown>) {
  useToolStateCache.setState({ cache: new Map([['html-validator', saved]]) })
}

function problemsList() {
  return screen.getByRole('list')
}

/** The problems panel only settles once the debounced run has reported. */
async function waitForProblems() {
  await waitFor(() => expect(screen.queryByText('Checking…')).not.toBeInTheDocument())
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

describe('rule configuration', () => {
  it('never hands HTMLHint a disabled rule', () => {
    // The old ruleset passed `false` for its three default-off rules, which the
    // panel drew as ticked — enabled-looking rules that could never fire.
    const ruleset = buildRuleset([], [])
    expect(Object.values(ruleset)).not.toContain(false)
    expect(ruleset['doctype-first']).toBeUndefined()
    expect(ruleset['tag-pair']).toBe(true)
  })

  it('passes a rule its mode rather than a bare true', () => {
    expect(buildRuleset([], ['id-class-value'])['id-class-value']).toBe('dash')
  })

  it('turns a default-on rule off and a default-off rule on', () => {
    expect(buildRuleset(['alt-require'], [])['alt-require']).toBeUndefined()
    expect(buildRuleset([], ['doctype-first'])['doctype-first']).toBe(true)
  })

  it('drops the override when a rule is set back to its default', () => {
    const rule = ruleById('alt-require')!
    const off = toggleRule(rule, [], [], false)
    expect(off.disabledRules).toEqual(['alt-require'])

    const backOn = toggleRule(rule, off.disabledRules, off.enabledRules, true)
    expect(backOn.disabledRules).toEqual([])
    expect(backOn.enabledRules).toEqual([])
    expect(countRuleOverrides(backOn.disabledRules, backOn.enabledRules)).toBe(0)
  })

  it('counts only departures from the defaults', () => {
    expect(countRuleOverrides([], [])).toBe(0)
    expect(countRuleOverrides(['alt-require'], ['doctype-first'])).toBe(2)
    // A default-on rule listed as enabled is not a change.
    expect(countRuleOverrides([], ['alt-require'])).toBe(0)
  })

  it('reports each rule as enabled exactly when the ruleset lists it', () => {
    const ruleset = buildRuleset(['tag-pair'], ['h1-require'])
    for (const rule of ALL_RULES) {
      expect(isRuleEnabled(rule, ['tag-pair'], ['h1-require'])).toBe(rule.id in ruleset)
    }
  })
})

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

describe('issue ordering', () => {
  const issue = (over: Partial<HtmlIssue>): HtmlIssue => ({
    message: 'x',
    line: 1,
    col: 1,
    type: 'warning',
    rule: 'r',
    ...over,
  })

  it('puts errors before warnings and then sorts by position', () => {
    const sorted = sortIssues([
      issue({ type: 'warning', line: 2 }),
      issue({ type: 'error', line: 9 }),
      issue({ type: 'error', line: 3 }),
    ])
    expect(sorted.map((i) => [i.type, i.line])).toEqual([
      ['error', 3],
      ['error', 9],
      ['warning', 2],
    ])
  })

  it('counts errors and warnings separately', () => {
    expect(countIssues([issue({ type: 'error' }), issue({})])).toEqual({ errors: 1, warnings: 1 })
  })
})

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

describe('computeStats', () => {
  it('does not count the wrappers the parser supplies for a fragment', () => {
    expect(computeStats('<div><span>hi</span></div>').elements).toBe(2)
  })

  it('counts the wrappers the document actually declares', () => {
    const stats = computeStats('<html><head></head><body><p>hi</p></body></html>')
    expect(stats.elements).toBe(4)
  })

  it('measures depth from the tree, not from a tag counter', () => {
    // The old stack-based count never popped `<li>`, so each sibling pushed the
    // reported depth one level deeper.
    expect(computeStats('<ul><li>a<li>b<li>c</ul>').depth).toBe(2)
  })

  it('decodes heading text and collapses its markup', () => {
    const stats = computeStats('<h1>Tips &amp; <em>tricks</em></h1>')
    expect(stats.headings).toEqual([{ level: 1, text: 'Tips & tricks' }])
  })

  it('counts style attributes and scripts', () => {
    const stats = computeStats('<p style="color:red">a</p><script>1</script>')
    expect(stats.styleAttributes).toBe(1)
    expect(stats.scripts).toBe(1)
  })
})

describe('outlineProblems', () => {
  it('says nothing about a well-formed outline', () => {
    expect(
      outlineProblems([
        { level: 1, text: 'a' },
        { level: 2, text: 'b' },
      ])
    ).toEqual([])
  })

  it('flags an outline that does not start at h1', () => {
    expect(outlineProblems([{ level: 2, text: 'a' }])[0]).toMatch(/starts at h2/)
  })

  it('flags more than one h1', () => {
    expect(
      outlineProblems([
        { level: 1, text: 'a' },
        { level: 1, text: 'b' },
      ]).join(' ')
    ).toMatch(/2 h1 headings/)
  })

  it('flags a skipped level', () => {
    expect(
      outlineProblems([
        { level: 1, text: 'a' },
        { level: 3, text: 'b' },
      ]).join(' ')
    ).toMatch(/h1 is followed by h3/)
  })

  it('has an entry for every template it ships', () => {
    for (const template of TEMPLATES) {
      expect(outlineProblems(computeStats(template.html).headings)).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('HtmlValidator', () => {
  it('renders the editor and an empty state', () => {
    renderTool(HtmlValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.getByText('Paste or open an HTML document')).toBeInTheDocument()
  })

  it('lists the problems it finds, worst first, with the rule that found them', async () => {
    renderTool(HtmlValidator)
    typeHtml('<DIV><img src="a.png"></DIV>')

    await waitFor(() => {
      expect(within(problemsList()).getAllByText(/lowercase/i).length).toBeGreaterThan(0)
    })
    expect(within(problemsList()).getAllByText('tagname-lowercase').length).toBeGreaterThan(0)
    expect(within(problemsList()).getAllByText('alt-require').length).toBeGreaterThan(0)
  })

  it('reports a clean document instead of leaving the panel blank', async () => {
    renderTool(HtmlValidator)
    typeHtml(TEMPLATES[0]!.html)

    // Before the first run reports, the panel says so rather than claiming a
    // clean bill of health it has not earned yet.
    expect(screen.getByText('Checking this document…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('No problems found')).toBeInTheDocument())
    expect(screen.getByTestId('validation-status')).toHaveTextContent(/No problems/)
  })

  it('keeps the previous problems on screen while the next run is in flight', async () => {
    renderTool(HtmlValidator)
    typeHtml('<DIV>a</DIV>')
    await waitFor(() =>
      expect(within(problemsList()).getAllByText('tagname-lowercase').length).toBeGreaterThan(0)
    )

    typeHtml('<DIV>ab</DIV>')
    // The list used to be cleared on every keystroke, so rows flickered away
    // from under the pointer between runs.
    expect(within(problemsList()).getAllByText('tagname-lowercase').length).toBeGreaterThan(0)
  })

  it('jumps back into the source when a problem in Preview view is clicked', async () => {
    renderTool(HtmlValidator)
    typeHtml('<DIV>a</DIV>')
    await waitFor(() => expect(screen.getByRole('list')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument()

    fireEvent.click(within(problemsList()).getAllByRole('button')[0]!)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('applies a rule the user switched on', async () => {
    renderTool(HtmlValidator)
    typeHtml('<html lang="en"><head><title>t</title></head><body><p>a</p></body></html>')
    await waitForProblems()
    expect(screen.getByText('No problems found')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Rules/ }))
    fireEvent.click(screen.getByLabelText('Doctype comes first'))

    await waitFor(() =>
      expect(within(problemsList()).getAllByText('doctype-first').length).toBeGreaterThan(0)
    )
    // The Rules button carries the count of departures from the defaults.
    expect(screen.getByRole('button', { name: /Rules/ })).toHaveTextContent('1')
  })

  it('drops the problems from a rule the user switched off, and restores them on reset', async () => {
    renderTool(HtmlValidator)
    typeHtml('<img src="a.png">')
    await waitFor(() =>
      expect(within(problemsList()).getAllByText('alt-require').length).toBeGreaterThan(0)
    )

    fireEvent.click(screen.getByRole('button', { name: /Rules/ }))
    fireEvent.click(screen.getByLabelText('Images have alt text'))
    await waitFor(() => expect(screen.queryByText('alt-require')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    await waitFor(() =>
      expect(within(problemsList()).getAllByText('alt-require').length).toBeGreaterThan(0)
    )
  })

  it('lists the heading outline and names the levels that were skipped', async () => {
    renderTool(HtmlValidator)
    typeHtml('<h1>Top</h1><h3>Skipped</h3>')

    fireEvent.click(screen.getByRole('radio', { name: /Outline/ }))
    await waitFor(() => expect(screen.getByText('Top')).toBeInTheDocument())
    expect(screen.getByText(/h1 is followed by h3/)).toBeInTheDocument()
  })

  it('confirms before a template replaces unsaved work', async () => {
    renderTool(HtmlValidator)
    typeHtml('<p>hand written</p>')

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.getByRole('dialog', { name: 'Replace unsaved changes?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByTestId('monaco-editor')).toHaveValue('<p>hand written</p>')

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue(templateById('minimal')!.html)
    )
  })

  it('does not treat a freshly loaded template as unsaved work', async () => {
    renderTool(HtmlValidator)
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue(templateById('minimal')!.html)
    )

    // Loading a second template used to ask to discard changes nobody had made.
    fireEvent.change(screen.getByLabelText('Starter template'), { target: { value: 'form' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue(templateById('form')!.html)
    )
  })

  it('loads the sample from the empty state', async () => {
    renderTool(HtmlValidator)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).not.toHaveValue(''))
    const editor = screen.getByTestId('monaco-editor') as HTMLTextAreaElement
    expect(editor.value).toContain('<!DOCTYPE')
  })

  it('formats the document through the formatter worker', async () => {
    renderTool(HtmlValidator)
    typeHtml('<html><head><title>t</title></head><body><p>a</p></body></html>')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    await waitFor(() => {
      const editor = screen.getByTestId('monaco-editor') as HTMLTextAreaElement
      expect(editor.value).toContain('\n  <head>')
    })
  })

  it('says why a document could not be formatted', async () => {
    renderTool(HtmlValidator)
    typeHtml('<div></span>')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    // Prettier refuses markup it cannot parse — exactly what this tool looks for.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Unexpected closing tag/)
    )
    expect(screen.getByTestId('monaco-editor')).toHaveValue('<div></span>')
  })

  it('previews the document in a sandboxed frame once typing settles', async () => {
    renderTool(HtmlValidator)
    typeHtml('<p>hello</p>')

    const frame = await screen.findByTitle('HTML preview')
    await waitFor(() => expect(frame).toHaveAttribute('srcdoc', '<p>hello</p>'))
    expect(frame).toHaveAttribute('sandbox', '')
  })

  it('expands the preview into a focus-trapped dialog', async () => {
    renderTool(HtmlValidator)
    typeHtml('<p>hello</p>')

    fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
    const dialog = screen.getByRole('dialog', { name: 'HTML preview' })
    expect(within(dialog).getByTitle('HTML preview (full size)')).toBeInTheDocument()

    // The hand-rolled overlay refocused its close button on every Tab, so the
    // dialog's own contents were unreachable.
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'HTML preview' })).not.toBeInTheDocument()
  })

  it('opens a file through the global open action', async () => {
    renderTool(HtmlValidator)
    dispatchToolAction({
      type: 'open-file',
      content: '<p>from disk</p>',
      filename: 'page.html',
      path: '/tmp/page.html',
    })

    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('page.html'))
    expect(screen.getByTestId('monaco-editor')).toHaveValue('<p>from disk</p>')
    // Straight off disk, the buffer matches the file.
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('saves to a file and stops reporting the buffer as modified', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/out.html')
    renderTool(HtmlValidator)
    typeHtml('<p>a</p>')
    expect(screen.getByText('Modified')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('out.html'))
    expect(saveFileDialog).toHaveBeenCalledWith('<p>a</p>', 'page.html')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('opens a file from the toolbar', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '<p>disk</p>',
      filename: 'index.html',
      path: '/tmp/index.html',
    })
    renderTool(HtmlValidator)

    fireEvent.click(screen.getByRole('button', { name: /Open/ }))
    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('index.html'))
  })

  it('is registered as accepting the global open and save actions', () => {
    expect(supportsToolFileAction('html-validator', 'open-file')).toBe(true)
    expect(supportsToolFileAction('html-validator', 'save-file')).toBe(true)
  })

  it('opens an editor for state saved under the old "edit" view mode', async () => {
    // The editor-only mode was renamed 'editor'. A hydrated 'edit' matched
    // neither pane test, so the tool came back with an empty body.
    seedToolState({ input: '<p>a</p>', viewMode: 'edit' })
    render(<HtmlValidator />)
    await waitForProblems()

    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('does not call a restored document modified before it is touched', async () => {
    // State written before `savedContent` existed hydrates without it.
    seedToolState({ input: '<p>a</p>' })
    render(<HtmlValidator />)
    await waitForProblems()

    expect(screen.getByText('Saved')).toBeInTheDocument()

    typeHtml('<p>ab</p>')
    await waitFor(() => expect(screen.getByText('Modified')).toBeInTheDocument())
  })

  it('records a run in history only after the user has edited the document', async () => {
    renderTool(HtmlValidator)
    await waitForProblems()
    expect(recordMock).not.toHaveBeenCalled()

    typeHtml('<p>a</p>')
    await waitFor(() => expect(recordMock).toHaveBeenCalled())
  })
})
