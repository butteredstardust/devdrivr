import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('var \u2192 const/let')).toBeInTheDocument()
    expect(screen.getByText('Arrow functions')).toBeInTheDocument()
    expect(screen.getByText('== \u2192 ===')).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByDisplayValue('JavaScript')).toBeInTheDocument()
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // Preview generation is auto-triggered (debounced 300ms) via the real
  // jscodeshift transform in the worker mock. A no-op worker mock never
  // resolves applyTransforms() and the Apply button / diff preview never
  // appear.

  it('applies the var-to-const transform via the real refactoring worker', async () => {
    renderTool(RefactoringToolkit)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: 'var x = 1;' } })

    const transformLabel = screen.getByText('var → const/let')
    const checkbox = transformLabel.closest('label')?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    fireEvent.click(checkbox as Element)

    const applyButton = await waitFor(
      () => {
        const button = screen.getByText('Apply')
        return button
      },
      { timeout: 3000 }
    )
    expect(screen.getByTestId('modified-editor')).toHaveValue('const x = 1;')

    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveValue('const x = 1;')
    })
  })
})
