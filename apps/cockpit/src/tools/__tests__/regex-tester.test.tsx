import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import RegexTester, { describeMatches } from '@/tools/regex-tester/RegexTester'

const setPattern = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), { target: { value } })
const setText = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), { target: { value } })

describe('describeMatches', () => {
  const base = { pattern: '\\d', error: null, count: 0, groupCount: 0, truncated: false }

  it('says nothing until there is a pattern', () => {
    expect(describeMatches({ ...base, pattern: '' })).toBe('')
  })

  it('reports an error ahead of any count', () => {
    expect(describeMatches({ ...base, error: 'Unterminated group', count: 3 })).toBe(
      'Pattern error: Unterminated group'
    )
  })

  it('distinguishes no matches from an empty pattern', () => {
    expect(describeMatches(base)).toBe('No matches')
  })

  it('singularises a lone match', () => {
    expect(describeMatches({ ...base, count: 1 })).toBe('1 match')
  })

  it('mentions capture groups when there are any', () => {
    expect(describeMatches({ ...base, count: 2, groupCount: 4 })).toBe(
      '2 matches, 4 capture groups'
    )
  })

  it('makes truncation audible', () => {
    expect(describeMatches({ ...base, count: 1000, truncated: true })).toBe(
      'Showing first 1000 matches, more were found'
    )
  })
})

describe('RegexTester (component)', () => {
  it('renders pattern input and test string area', () => {
    renderTool(RegexTester)
    expect(screen.getByPlaceholderText(/enter regex pattern/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter text to test/i)).toBeInTheDocument()
  })

  it('shows match count when pattern matches', async () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '\\d+' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'abc 123 def 456' },
    })
    // The badge reads "2 matches", split across text nodes by the JSX — a
    // bare getByText('2') would miss it.
    expect(await screen.findByTestId('match-count')).toHaveTextContent('2 matches')
  })

  it('names the capture-group count next to the match count', async () => {
    renderTool(RegexTester)
    setPattern('(\\d)(\\d)')
    setText('12 34')

    // Captures across all matches — the same total the sr-only live region and
    // the matches pane already report. It previously existed only there, so a
    // sighted user had to count parentheses to get it.
    expect(await screen.findByTestId('match-count')).toHaveTextContent('2 matches')
    expect(screen.getByTestId('match-count')).toHaveTextContent('4 groups')
  })

  it('exposes regex flag toggle pressed state', () => {
    renderTool(RegexTester)

    const globalFlag = screen.getByRole('button', { name: /global/i })
    const caseInsensitiveFlag = screen.getByRole('button', { name: /case insensitive/i })

    expect(globalFlag).toHaveAttribute('aria-pressed', 'true')
    expect(caseInsensitiveFlag).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(caseInsensitiveFlag)
    expect(caseInsensitiveFlag).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows match and replace tabs', () => {
    renderTool(RegexTester)
    expect(screen.getByText('Match')).toBeInTheDocument()
    expect(screen.getByText('Replace')).toBeInTheDocument()
  })

  it('switches to replace mode', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    expect(screen.getByPlaceholderText(/replacement pattern/i)).toBeInTheDocument()
  })

  // ── Diff view ────────────────────────────────────────────────────

  it('does not show Diff toggle when not in replace mode', () => {
    renderTool(RegexTester)
    // Match mode is default — no Diff button
    expect(screen.queryByTitle(/show diff/i)).not.toBeInTheDocument()
  })

  it('does not show Diff toggle in replace mode without pattern and text', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    expect(screen.queryByTitle(/show diff/i)).not.toBeInTheDocument()
  })

  it('shows Diff toggle in replace mode when pattern and text are set', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'hello world' },
    })
    expect(screen.getByTitle(/show diff/i)).toBeInTheDocument()
  })

  it('clicking Diff toggle shows diff view and changes button title', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'hello world' },
    })
    fireEvent.change(screen.getByPlaceholderText(/replacement pattern/i), {
      target: { value: 'hi' },
    })

    // Click Diff
    fireEvent.click(screen.getByTitle(/show diff/i))

    // Button title should now say "plain result"
    expect(screen.getByTitle(/show plain result/i)).toBeInTheDocument()
  })

  it('shows +/- char stats when diff is active', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'hello world' },
    })
    fireEvent.change(screen.getByPlaceholderText(/replacement pattern/i), {
      target: { value: 'hi' },
    })

    fireEvent.click(screen.getByTitle(/show diff/i))

    // Stats show added/removed char counts
    // "hello" (5) replaced by "hi" (2): -5 +2
    expect(screen.getByText(/chars/i)).toBeInTheDocument()
  })

  it('keeps unnamed capture groups when named groups are also present', async () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '([A-Z])(?<digits>\\d+)' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'A12' },
    })

    expect(await screen.findByText('$1')).toBeInTheDocument()
    expect(screen.getByText('digits')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('warns when only the first 1000 matches are shown', async () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '.' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'a'.repeat(1205) },
    })

    expect(await screen.findByTestId('match-count')).toHaveTextContent('1000+ matches')
    expect(screen.getByText('Showing first 1000 matches')).toBeInTheDocument()
    expect(screen.getByText(/First 1000 matches/)).toBeInTheDocument()
  })

  it('announces an invalid pattern error via role="alert"', async () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '(' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'abc' },
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/./)
  })

  it('announces a replace-mode error via role="alert"', async () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '(' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'abc' },
    })

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
  })

  // Two elements state the match count visually; exactly one of them may be live, or every
  // keystroke is announced twice.
  it('carries the match count in exactly one live region', async () => {
    renderTool(RegexTester)
    setPattern('\\d+')
    setText('abc 123 def 456')

    // The badge reads "2 matches", split across text nodes by the JSX — a
    // bare getByText('2') would miss it.
    expect(await screen.findByTestId('match-count')).toHaveTextContent('2 matches')

    const live = document.querySelectorAll('[aria-live]')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveAttribute('role', 'status')
    expect(live[0]).toHaveTextContent('2 matches')
  })

  it('announces the no-match case, which is otherwise silent', async () => {
    renderTool(RegexTester)
    setPattern('zzz')
    setText('abc')

    const live = await screen.findByRole('status')
    expect(live).toHaveTextContent('No matches')
  })

  it('toggling Diff off returns to plain result view', () => {
    renderTool(RegexTester)
    fireEvent.click(screen.getByText('Replace'))
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: 'hello' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'hello world' },
    })
    fireEvent.change(screen.getByPlaceholderText(/replacement pattern/i), {
      target: { value: 'hi' },
    })

    // Turn on, then turn off
    fireEvent.click(screen.getByTitle(/show diff/i))
    fireEvent.click(screen.getByTitle(/show plain result/i))

    // Back to "show diff" title
    expect(screen.getByTitle(/show diff/i)).toBeInTheDocument()
  })
})
