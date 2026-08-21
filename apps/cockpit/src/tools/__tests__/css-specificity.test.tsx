import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssSpecificity from '../css-specificity/CssSpecificity'

describe('CssSpecificity', () => {
  it('renders input area', () => {
    renderTool(CssSpecificity)
    expect(screen.getByPlaceholderText(/main.*content/i)).toBeInTheDocument()
  })

  it('calculates specificity for a selector', () => {
    renderTool(CssSpecificity)
    const input = screen.getByPlaceholderText(/main.*content/i)
    fireEvent.change(input, { target: { value: '#id .class p' } })
    expect(screen.getByText(/1 selector/i)).toBeInTheDocument()
  })

  it('handles multiple selectors', () => {
    renderTool(CssSpecificity)
    const input = screen.getByPlaceholderText(/main.*content/i)
    fireEvent.change(input, { target: { value: '#id\n.class\np' } })
    expect(screen.getByText(/3 selector/i)).toBeInTheDocument()
  })

  it('compares specificity lexicographically instead of collapsing large counts', () => {
    renderTool(CssSpecificity)
    fireEvent.change(screen.getByPlaceholderText(/main.*content/i), {
      target: { value: '#id\n.a.a.a.a.a.a.a.a.a.a.a' },
    })
    expect(screen.getAllByText('#id')[0]?.closest('.rounded')).toHaveTextContent('WINS')
  })

  it('explains that the later rule wins a specificity tie', () => {
    renderTool(CssSpecificity)
    fireEvent.change(screen.getByPlaceholderText(/main.*content/i), {
      target: { value: '.first\n.second' },
    })
    expect(screen.getByText('WINS · LATER RULE')).toBeInTheDocument()
    expect(screen.getByText('TIED')).toBeInTheDocument()
  })
})
