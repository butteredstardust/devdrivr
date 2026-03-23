import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderTool } from './test-utils'
import RefactoringToolkit from '../refactoring-toolkit/RefactoringToolkit'

describe('RefactoringToolkit', () => {
  it('renders editor', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('renders transform categories', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByText('Modernize')).toBeInTheDocument()
    expect(screen.getByText('Type Safety')).toBeInTheDocument()
    expect(screen.getByText('Cleanup')).toBeInTheDocument()
  })

  it('renders transform checkboxes', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByText('var \u2192 const')).toBeInTheDocument()
    expect(screen.getByText('Arrow functions')).toBeInTheDocument()
    expect(screen.getByText('== \u2192 ===')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByDisplayValue('JavaScript')).toBeInTheDocument()
  })
})
