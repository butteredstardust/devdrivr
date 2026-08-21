import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from './test-utils'
import RefactoringToolkit from '../refactoring-toolkit/RefactoringToolkit'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import { TOOLS } from '@/app/tool-registry'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

const WAIT = { timeout: 5000 }

function editor() {
  return screen.getByTestId('monaco-editor') as HTMLTextAreaElement
}

function typeCode(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

function panel() {
  return within(screen.getByRole('region', { name: 'Transforms' }))
}

function checkTransform(name: string) {
  fireEvent.click(panel().getByRole('checkbox', { name: new RegExp(name) }))
}

beforeEach(() => {
  vi.mocked(saveFileDialog).mockReset().mockResolvedValue('/tmp/refactored.js')
  useUiStore.setState({ lastAction: null })
})

describe('RefactoringToolkit', () => {
  it('labels the transform panel and the editing surface', () => {
    renderTool(RefactoringToolkit)
    expect(screen.getByRole('region', { name: 'Transforms' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Source' })).toBeInTheDocument()
    expect(editor()).toBeInTheDocument()
  })

  it('groups transforms by category with a select-all per group', () => {
    renderTool(RefactoringToolkit)
    expect(panel().getByText('Modernize')).toBeInTheDocument()
    expect(panel().getByText('Type Safety')).toBeInTheDocument()
    expect(panel().getByText('Cleanup')).toBeInTheDocument()
    // The old category header was a <button> wrapping a checkbox — one
    // interactive control nested inside another.
    expect(
      panel().getByRole('checkbox', { name: 'Select all Modernize transforms' })
    ).toBeInTheDocument()
  })

  it('shows each transform with its safety level, not just a coloured dot', () => {
    renderTool(RefactoringToolkit)
    const row = panel().getByText('Remove console.*').closest('label')!
    expect(within(row).getByText('destructive')).toBeInTheDocument()
  })

  it('filters the transform list', () => {
    renderTool(RefactoringToolkit)
    fireEvent.change(screen.getByLabelText('Filter transforms'), { target: { value: 'arrow' } })

    expect(panel().getByText('Arrow functions')).toBeInTheDocument()
    expect(panel().queryByText('Remove debugger')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filter transforms'), { target: { value: 'zzz' } })
    expect(panel().getByText(/No transforms match/)).toBeInTheDocument()
  })

  it('select-all only touches the transforms the filter leaves visible', () => {
    renderTool(RefactoringToolkit)
    fireEvent.change(screen.getByLabelText('Filter transforms'), { target: { value: 'console' } })
    fireEvent.click(panel().getByRole('checkbox', { name: 'Select all Cleanup transforms' }))

    fireEvent.change(screen.getByLabelText('Filter transforms'), { target: { value: '' } })
    expect(panel().getByRole('checkbox', { name: /Remove console/ })).toBeChecked()
    expect(panel().getByRole('checkbox', { name: /Remove debugger/ })).not.toBeChecked()
  })

  it('registers the file actions the shell shortcuts rely on', () => {
    const tool = TOOLS.find((t) => t.id === 'refactoring-toolkit')
    expect(tool?.supportsOpenFile).toBe(true)
    expect(tool?.supportsSaveFile).toBe(true)
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // These run the real jscodeshift transforms through the worker mock; a no-op
  // mock never resolves applyTransforms and no diff ever appears.

  it('previews a transform as a diff and applies it to the buffer', async () => {
    renderTool(RefactoringToolkit)
    typeCode('var x = 1;')
    checkTransform('var → const/let')

    await waitFor(() => {
      expect(screen.getByTestId('modified-editor')).toHaveValue('const x = 1;')
    }, WAIT)
    expect(screen.getByRole('region', { name: 'Transform preview' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
    await waitFor(() => expect(editor()).toHaveValue('const x = 1;'), WAIT)
    // Applying is not a dead end: the pre-transform code stays one click away.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('undoes an apply back to the original source', async () => {
    renderTool(RefactoringToolkit)
    typeCode('var x = 1;')
    checkTransform('var → const/let')
    await waitFor(() => expect(screen.getByTestId('modified-editor')).toBeInTheDocument(), WAIT)

    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
    await waitFor(() => expect(editor()).toHaveValue('const x = 1;'), WAIT)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(editor()).toHaveValue('var x = 1;')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  it('keeps multiple apply snapshots and handles mod+z', async () => {
    renderTool(RefactoringToolkit)
    typeCode("var x = 1 == '1';")
    checkTransform('var → const/let')
    await waitFor(() => expect(screen.getByTestId('modified-editor')).toBeInTheDocument(), WAIT)
    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
    await waitFor(() => expect(editor()).toHaveValue("const x = 1 == '1';"), WAIT)

    checkTransform('== → ===')
    await waitFor(() => expect(screen.getByTestId('modified-editor')).toBeInTheDocument(), WAIT)
    fireEvent.click(screen.getByRole('button', { name: /^Apply/ }))
    await waitFor(() => expect(editor()).toHaveValue("const x = 1 === '1';"), WAIT)

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(editor()).toHaveValue("const x = 1 == '1';")
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(editor()).toHaveValue("var x = 1 == '1';")
  })

  it('warns on the Apply button when a destructive transform is selected', async () => {
    renderTool(RefactoringToolkit)
    typeCode('console.log(1)\nvar y = 2;')
    checkTransform('Remove console')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply \(removes code\)/ })).toBeEnabled()
    }, WAIT)
  })

  it('says so instead of offering an empty diff when nothing changes', async () => {
    renderTool(RefactoringToolkit)
    typeCode('const x = 1;')
    checkTransform('var → const/let')

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('No changes for this code')
    }, WAIT)
    expect(screen.getByRole('button', { name: /^Apply/ })).toBeDisabled()
    expect(screen.queryByTestId('modified-editor')).not.toBeInTheDocument()
  })

  it('lets the user back to the source while transforms stay selected', async () => {
    renderTool(RefactoringToolkit)
    typeCode('var x = 1;')
    checkTransform('var → const/let')
    await waitFor(() => expect(screen.getByTestId('modified-editor')).toBeInTheDocument(), WAIT)

    // The diff editor is read-only: without this the tool trapped the user out
    // of their own buffer until they deselected every transform.
    fireEvent.click(screen.getByRole('radio', { name: 'Source' }))
    expect(editor()).toHaveValue('var x = 1;')
    expect(panel().getByRole('checkbox', { name: /var → const/ })).toBeChecked()
  })

  it('copies what the current view shows, not the hidden preview', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(RefactoringToolkit)
    typeCode('var x = 1;')
    checkTransform('var → const/let')
    await waitFor(() => expect(screen.getByTestId('modified-editor')).toBeInTheDocument(), WAIT)

    fireEvent.click(screen.getByRole('button', { name: 'Copy transformed code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const x = 1;'))

    fireEvent.click(screen.getByRole('radio', { name: 'Source' }))
    // The button still reads "Copied" from the click above.
    fireEvent.click(screen.getByRole('button', { name: /Cop(y|ied)/ }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('var x = 1;'))
  })

  it('does not open a save dialog for an empty buffer', () => {
    renderTool(RefactoringToolkit)
    act(() => {
      dispatchToolAction({ type: 'save-file' })
    })
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Nothing to save yet' })
  })

  it('reports a transform failure inline rather than only as a toast', async () => {
    renderTool(RefactoringToolkit)
    typeCode('function (){')
    checkTransform('Arrow functions')

    const alert = await screen.findByRole('alert', undefined, WAIT)
    expect(alert).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Transform failed')
  })

  it('loads an opened file, picks its language and saves it back', async () => {
    renderTool(RefactoringToolkit)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'const a: number = 1',
        filename: 'math.ts',
      })
    })
    expect(editor()).toHaveValue('const a: number = 1')
    expect(screen.getByLabelText('Language')).toHaveValue('typescript')
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened math.ts' })

    act(() => {
      dispatchToolAction({ type: 'save-file' })
    })
    await waitFor(() => {
      expect(saveFileDialog).toHaveBeenCalledWith('const a: number = 1', 'math.ts')
    })
  })

  it('offers an example while the buffer is empty', () => {
    renderTool(RefactoringToolkit)
    fireEvent.click(screen.getByRole('button', { name: 'Load example' }))

    expect(editor().value).toContain("var API = require('./api')")
    expect(screen.queryByRole('button', { name: 'Load example' })).not.toBeInTheDocument()
  })
})
