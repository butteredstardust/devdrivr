import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssToTailwind from '../css-to-tailwind/CssToTailwind'

describe('CssToTailwind', () => {
  it('renders editor and output panel', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('CSS Input')).toBeInTheDocument()
    expect(screen.getByText('Tailwind Output')).toBeInTheDocument()
  })

  it('converts CSS to Tailwind classes', () => {
    renderTool(CssToTailwind)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'display: flex;\npadding: 1rem;' } })
    expect(screen.getByText('flex')).toBeInTheDocument()
  })

  it('shows empty state when no input', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('Enter CSS on the left to convert')).toBeInTheDocument()
  })
})
