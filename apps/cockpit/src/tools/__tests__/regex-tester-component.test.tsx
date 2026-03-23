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
})
