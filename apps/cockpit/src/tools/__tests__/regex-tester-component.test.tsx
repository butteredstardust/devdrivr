import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import RegexTester from '../regex-tester/RegexTester'

describe('RegexTester (component)', () => {
  it('renders pattern input and test string area', () => {
    renderTool(RegexTester)
    expect(screen.getByPlaceholderText(/enter regex pattern/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter text to test/i)).toBeInTheDocument()
  })

  it('shows match count when pattern matches', () => {
    renderTool(RegexTester)
    fireEvent.change(screen.getByPlaceholderText(/enter regex pattern/i), {
      target: { value: '\\d+' },
    })
    fireEvent.change(screen.getByPlaceholderText(/enter text to test/i), {
      target: { value: 'abc 123 def 456' },
    })
    expect(screen.getByText('2')).toBeInTheDocument()
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
