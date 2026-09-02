import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { useToolStateCache } from '@/stores/tool-state.store'
import CssValidator from '@/tools/css-validator/CssValidator'
import {
  ALL_RULES,
  TEMPLATES,
  analyzeCss,
  compareSpecificity,
  countIssues,
  countRuleOverrides,
  isRuleEnabled,
  ruleById,
  sortIssues,
  specificityOf,
  templateById,
  toggleRule,
  type CssIssue,
} from '@/tools/css-validator/css-helpers'
import { openFileDialog, saveFileDialog, saveFileToPath } from '@/lib/file-io'
import { dispatchToolAction, supportsToolFileAction } from '@/lib/tool-actions'
import * as cssTree from 'css-tree'

const recordMock = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/useToolHistory', () => ({
  useToolHistory: () => ({ record: recordMock }),
}))

vi.mock('@/lib/file-io', () => ({
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  saveFileToPath: vi.fn(),
  filenameFromPath: (path: string) => path.split(/[\\/]/).pop() || path,
}))

afterEach(() => {
  vi.clearAllMocks()
})

function typeCss(css: string) {
  fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: css } })
}

/** Stands in for a session persisted by an earlier version of the tool. */
function seedToolState(saved: Record<string, unknown>) {
  useToolStateCache.setState({ cache: new Map([['css-validator', saved]]) })
}

/** The problems panel only settles once the debounced run has reported. */
async function waitForProblems() {
  await waitFor(() => expect(screen.queryByText('Checking…')).not.toBeInTheDocument())
}

function analyze(css: string, disabled: string[] = [], enabled: string[] = []) {
  return analyzeCss(css, disabled, enabled)
}

function rulesOf(css: string, disabled: string[] = [], enabled: string[] = []) {
  return analyze(css, disabled, enabled).issues.map((issue) => issue.rule)
}

// ---------------------------------------------------------------------------
// Properties and values
// ---------------------------------------------------------------------------

describe('property checking', () => {
  it('accepts CSS newer than any hand-written property list', () => {
    // The old checker compared against ~150 hardcoded names, so every property
    // added since that list was typed was reported as unknown.
    expect(rulesOf('.a { inset: 0; aspect-ratio: 16 / 9; gap: 1rem; }')).not.toContain(
      'unknown-properties'
    )
  })

  it('flags a misspelled property', () => {
    const issue = analyze('.a { colr: red; }').issues.find(
      (candidate) => candidate.rule === 'unknown-properties'
    )
    expect(issue?.message).toMatch(/colr/)
  })

  it('leaves custom properties alone', () => {
    expect(rulesOf(':root { --brand: whatever they like; }')).not.toContain('unknown-properties')
  })

  it('leaves vendor-prefixed properties alone', () => {
    expect(rulesOf('.a { -webkit-line-clamp: 2; }')).not.toContain('unknown-properties')
  })

  it('flags a value that does not match the property grammar', () => {
    const issue = analyze('.a { padding: 3; }').issues.find(
      (candidate) => candidate.rule === 'invalid-values'
    )
    expect(issue?.message).toMatch(/not a valid value for "padding"/)
  })

  it('does not guess at values it cannot resolve', () => {
    // A var() the lexer cannot expand is a limit of the checker, not a mistake.
    expect(rulesOf('.a { padding: var(--space); }')).not.toContain('invalid-values')
  })

  it('reports a syntax error as an error with a position', () => {
    const issue = analyze('.a {\n  color red;\n}').issues.find(
      (candidate) => candidate.type === 'error'
    )
    expect(issue?.rule).toBe('syntax-errors')
    expect(issue?.line).toBe(2)
  })

  it('says nothing about syntax once that rule is off', () => {
    expect(rulesOf('.a {\n  color red;\n}', ['syntax-errors'])).not.toContain('syntax-errors')
  })
})

// ---------------------------------------------------------------------------
// Style rules
// ---------------------------------------------------------------------------

describe('style rules', () => {
  it('flags a unit on zero rather than its absence', () => {
    // The old rule asked for a unit *on* zero, so idiomatic `margin: 0` was
    // reported and `0px` was not.
    expect(rulesOf('.a { margin: 0; }')).not.toContain('redundant-zero-units')
    const issue = analyze('.a { margin: 0px; }').issues.find(
      (candidate) => candidate.rule === 'redundant-zero-units'
    )
    expect(issue?.message).toMatch(/"0px" can be written "0"/)
  })

  it('names the earlier line when a property is set twice', () => {
    const issue = analyze('.a {\n  display: flex;\n  display: block;\n}').issues.find(
      (candidate) => candidate.rule === 'duplicate-properties'
    )
    expect(issue?.message).toMatch(/already set on line 2/)
  })

  it('flags empty rules and ID selectors', () => {
    const rules = rulesOf('#page {}')
    expect(rules).toContain('empty-rules')
    expect(rules).toContain('id-selectors')
  })

  it('counts compound parts, not characters, for overqualified selectors', () => {
    expect(rulesOf('.a.b.c.d { color: red; }')).not.toContain('overqualified')
    expect(rulesOf('.a > .b .c + .d { color: red; }')).toContain('overqualified')
  })

  it('does not count a combinator inside :is() as a level of its own', () => {
    expect(rulesOf('.a :is(.b .c, .d .e) { color: red; }')).not.toContain('overqualified')
  })

  it('keeps !important and long hex off by default', () => {
    const rules = rulesOf('.a { color: #ffffff !important; }')
    expect(rules).not.toContain('important')
    expect(rules).not.toContain('hex-length')
  })

  it('reports !important and long hex once they are switched on', () => {
    const rules = rulesOf('.a { color: #ffffff !important; }', [], ['important', 'hex-length'])
    expect(rules).toContain('important')
    expect(rules).toContain('hex-length')
  })

  it('flags a deprecated property', () => {
    expect(rulesOf('.a { zoom: 1; }')).toContain('deprecated')
  })
})

// ---------------------------------------------------------------------------
// Rule configuration
// ---------------------------------------------------------------------------

describe('rule configuration', () => {
  it('drops the override when a rule is set back to its default', () => {
    const rule = ruleById('id-selectors')!
    const off = toggleRule(rule, [], [], false)
    expect(off.disabledRules).toEqual(['id-selectors'])

    const backOn = toggleRule(rule, off.disabledRules, off.enabledRules, true)
    expect(backOn.disabledRules).toEqual([])
    expect(backOn.enabledRules).toEqual([])
    expect(countRuleOverrides(backOn.disabledRules, backOn.enabledRules)).toBe(0)
  })

  it('counts only departures from the defaults', () => {
    expect(countRuleOverrides([], [])).toBe(0)
    expect(countRuleOverrides(['id-selectors'], ['important'])).toBe(2)
    // A default-on rule listed as enabled is not a change.
    expect(countRuleOverrides([], ['id-selectors'])).toBe(0)
  })

  it('resolves every rule against the overrides it was given', () => {
    for (const rule of ALL_RULES) {
      const expected =
        rule.id === 'id-selectors' ? false : rule.id === 'important' ? true : rule.defaultEnabled
      expect(isRuleEnabled(rule, ['id-selectors'], ['important'])).toBe(expected)
    }
  })

  it('stops reporting a rule that is switched off', () => {
    expect(rulesOf('#page { color: red; }', ['id-selectors'])).not.toContain('id-selectors')
  })
})

// ---------------------------------------------------------------------------
// Issues, statistics and specificity
// ---------------------------------------------------------------------------

describe('issue ordering', () => {
  const issue = (over: Partial<CssIssue>): CssIssue => ({
    message: 'x',
    line: 1,
    column: 1,
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
    expect(sorted.map((item) => [item.type, item.line])).toEqual([
      ['error', 3],
      ['error', 9],
      ['warning', 2],
    ])
  })

  it('counts errors and warnings separately', () => {
    expect(countIssues([issue({ type: 'error' }), issue({})])).toEqual({ errors: 1, warnings: 1 })
  })
})

describe('statistics', () => {
  it('counts rules, selectors, declarations and media queries in one pass', () => {
    const { stats } = analyze(
      '@media (min-width: 40rem) { .a, .b { color: red; padding: 1rem; } }\n.c { color: blue; }'
    )
    expect(stats.rules).toBe(2)
    expect(stats.selectors).toBe(3)
    expect(stats.declarations).toBe(3)
    expect(stats.mediaQueries).toBe(1)
  })

  it('counts custom properties, IDs and !important', () => {
    const { stats } = analyze(':root { --a: 1px; }\n#b .c { color: red !important; }')
    expect(stats.customProperties).toBe(1)
    expect(stats.idSelectors).toBe(1)
    expect(stats.importants).toBe(1)
  })

  it('counts a selector with two IDs once', () => {
    expect(analyze('#a#b { color: red; }').stats.idSelectors).toBe(1)
  })
})

describe('specificity', () => {
  const specificityFor = (selector: string) =>
    specificityOf(cssTree.parse(selector, { context: 'selector' }))

  it('scores ids, classes and elements separately', () => {
    expect(specificityFor('#a .b span')).toEqual([1, 1, 1])
    expect(specificityFor('a[href]:hover')).toEqual([0, 2, 1])
  })

  it('does not count the universal selector as an element', () => {
    expect(specificityFor('*')).toEqual([0, 0, 0])
  })

  it('gives `:where()` away entirely', () => {
    // Adding up everything the walk passed scored the id this selector was
    // written specifically to disown.
    expect(specificityFor(':where(.a) .b')).toEqual([0, 1, 0])
    expect(specificityFor(':where(#a) .b')).toEqual([0, 1, 0])
  })

  it('takes the most specific argument of `:is()` and `:not()`, not their sum', () => {
    expect(specificityFor(':is(.a, #b) .c')).toEqual([1, 1, 0])
    expect(specificityFor(':not(.a, #b)')).toEqual([1, 0, 0])
  })

  it('counts an ordinary pseudo-class as a class', () => {
    expect(specificityFor('a:hover::before')).toEqual([0, 1, 2])
  })

  it('ranks the hardest selector to override first', () => {
    const { selectors } = analyze('.a { color: red; }\n#b { color: red; }')
    expect([...selectors].sort(compareSpecificity)[0]?.text).toBe('#b')
  })
})

describe('templates', () => {
  it('ships templates that pass their own checks', () => {
    for (const template of TEMPLATES) {
      expect(analyze(template.css, [], []).issues).toEqual([])
    }
  })

  it('looks a template up by id', () => {
    expect(templateById(TEMPLATES[0]!.id)?.label).toBe(TEMPLATES[0]!.label)
  })
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

describe('CssValidator', () => {
  it('renders the editor and an empty state', () => {
    renderTool(CssValidator)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    expect(screen.getByText('Paste or open a stylesheet')).toBeInTheDocument()
  })

  it('lists problems with the rule that found them', async () => {
    renderTool(CssValidator)
    typeCss('#page .a .b .c { colr: red; }')
    await waitForProblems()

    const list = screen.getByRole('list')
    expect(within(list).getAllByText('unknown-properties').length).toBeGreaterThan(0)
    expect(within(list).getAllByText('id-selectors').length).toBeGreaterThan(0)
  })

  it('says it is still checking before the first verdict', async () => {
    renderTool(CssValidator)
    typeCss('.a { color: red; }')
    expect(screen.getByText('Checking this stylesheet…')).toBeInTheDocument()
    await waitForProblems()
    expect(screen.getByText('No problems found')).toBeInTheDocument()
  })

  it('keeps the previous problems on screen while the next run is pending', async () => {
    renderTool(CssValidator)
    typeCss('#page { color: red; }')
    await waitForProblems()

    typeCss('#page { color: red; }\n.b {}')
    expect(screen.getAllByText('id-selectors').length).toBeGreaterThan(0)
    await waitForProblems()
    expect(screen.getAllByText('empty-rules').length).toBeGreaterThan(0)
  })

  it('offers every problem as a control that jumps to its position', async () => {
    renderTool(CssValidator)
    typeCss('.a { margin: 0px; }')
    await waitForProblems()

    // The shared Monaco mock never mounts a real editor, so this asserts the row
    // is a control at all — the old panel rendered coordinates as plain text.
    const row = screen.getByTitle(/^Go to line 1, column/)
    expect(row.tagName).toBe('BUTTON')
    fireEvent.click(row)
  })

  it('switches a rule off and back on from the rules panel', async () => {
    renderTool(CssValidator)
    typeCss('#page { color: red; }')
    await waitForProblems()
    expect(screen.getAllByText('id-selectors').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Rules/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'ID selectors' }))
    await waitFor(() => expect(screen.queryByText('id-selectors')).not.toBeInTheDocument())
    expect(screen.getByText('1 rule changed from the defaults.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }))
    await waitFor(() => expect(screen.getAllByText('id-selectors').length).toBeGreaterThan(0))
  })

  it('ranks selectors by specificity in the selectors panel', async () => {
    renderTool(CssValidator)
    typeCss('.a { color: red; }\n#b { color: red; }')
    await waitForProblems()

    fireEvent.click(screen.getByRole('radio', { name: 'Selectors (2)' }))
    const rows = within(screen.getByRole('list')).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('#b')
    expect(rows[0]).toHaveTextContent('1-0-0')
  })

  it('asks before a template replaces unsaved work', async () => {
    renderTool(CssValidator)
    typeCss('.mine { color: red; }')
    await waitForProblems()

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.getByText('Replace unsaved changes?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByTestId('monaco-editor')).toHaveValue('.mine { color: red; }')

    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() =>
      expect((screen.getByTestId('monaco-editor') as HTMLTextAreaElement).value).toContain(
        '.container'
      )
    )
  })

  it('loads the sample from the empty state', async () => {
    renderTool(CssValidator)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))
    await waitFor(() =>
      expect((screen.getByTestId('monaco-editor') as HTMLTextAreaElement).value).toContain('#page')
    )
  })

  it('formats through the shared formatter', async () => {
    renderTool(CssValidator)
    typeCss('.a{color:red}')
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    await waitFor(() =>
      expect(screen.getByTestId('monaco-editor')).toHaveValue('.a {\n  color: red;\n}\n')
    )
  })

  it('explains why unparseable CSS cannot be formatted', async () => {
    renderTool(CssValidator)
    typeCss('.a { color: red; } }')
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // The old fallback quietly rewrote the text with a regex instead.
    expect(screen.getByTestId('monaco-editor')).toHaveValue('.a { color: red; } }')
  })

  it('opens a file and saves back to its known path', async () => {
    vi.mocked(openFileDialog).mockResolvedValue({
      content: '.opened { color: red; }',
      filename: 'site.css',
      path: '/tmp/site.css',
    })
    vi.mocked(saveFileToPath).mockResolvedValue(undefined)
    renderTool(CssValidator)

    fireEvent.click(screen.getByRole('button', { name: /Open/ }))
    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('site.css'))

    fireEvent.click(screen.getByRole('button', { name: 'Save stylesheet' }))
    await waitFor(() =>
      expect(saveFileToPath).toHaveBeenCalledWith('/tmp/site.css', '.opened { color: red; }')
    )
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(screen.getByTestId('file-name')).toHaveTextContent('site.css')
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('accepts a stylesheet from the global open-file action', async () => {
    renderTool(CssValidator)
    dispatchToolAction({
      type: 'open-file',
      content: '.global { color: red; }',
      filename: 'global.css',
      path: '/tmp/global.css',
    })
    await waitFor(() => expect(screen.getByTestId('file-name')).toHaveTextContent('global.css'))
  })

  it('is registered as accepting the global open and save actions', () => {
    expect(supportsToolFileAction('css-validator', 'open-file')).toBe(true)
    expect(supportsToolFileAction('css-validator', 'save-file')).toBe(true)
  })

  it('records a run in history only after the user has edited the stylesheet', async () => {
    renderTool(CssValidator)
    await waitForProblems()
    expect(recordMock).not.toHaveBeenCalled()

    typeCss('.a { color: red; }')
    await waitFor(() => expect(recordMock).toHaveBeenCalled())
  })

  it('remembers unsaved work across the unmount a tab switch causes', async () => {
    // Dirtiness used to live in a ref, so leaving the tab and coming back
    // reported typed-but-unsaved CSS as "Saved" and let the next template
    // replace it without asking.
    const { unmount } = renderTool(CssValidator)
    typeCss('.mine { color: red; }')
    await waitFor(() => expect(screen.getByText('Modified')).toBeInTheDocument())
    unmount()

    render(<CssValidator />)
    await waitFor(() => expect(screen.getByText('Modified')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.getByText('Replace unsaved changes?')).toBeInTheDocument()
  })

  it('counts the problems it does not list rather than mounting them all', async () => {
    renderTool(CssValidator)
    // 250 rules, each with a redundant unit on zero.
    typeCss(Array.from({ length: 250 }, (_, i) => `.r${i} { margin: 0px; }`).join('\n'))
    await waitForProblems()

    expect(screen.getByRole('radio', { name: 'Problems (250)' })).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(200)
    expect(screen.getByText(/50 more problems not listed/)).toBeInTheDocument()
  })

  it('does not call a restored stylesheet modified before it is touched', async () => {
    // State written before `savedContent` existed hydrates without it.
    seedToolState({ input: '.a { color: red; }' })
    render(<CssValidator />)
    await waitForProblems()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    typeCss('.a { color: blue; }')
    await waitFor(() => expect(screen.getByText('Modified')).toBeInTheDocument())
  })
})
