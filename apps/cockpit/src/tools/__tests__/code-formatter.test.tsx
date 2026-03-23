import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import CodeFormatter from '../code-formatter/CodeFormatter'

describe('CodeFormatter', () => {
  it('renders format button', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Format')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(CodeFormatter)
    expect(screen.getByDisplayValue('javascript')).toBeInTheDocument()
  })

  it('renders editor', () => {
    renderTool(CodeFormatter)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows formatting options', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Single quotes')).toBeInTheDocument()
    expect(screen.getByText('Semicolons')).toBeInTheDocument()
  })
})
