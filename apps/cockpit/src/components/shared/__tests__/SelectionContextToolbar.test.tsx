import { useMemo, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyIcon } from '@phosphor-icons/react'
import { SelectionContextToolbar } from '@/components/shared/SelectionContextToolbar'
import { useDomSelectionToolbar } from '@/hooks/useDomSelectionToolbar'
import { useMonacoSelectionToolbar } from '@/hooks/useMonacoSelectionToolbar'

function SelectionHarness({ onSelect }: { onSelect: (text: string) => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const { selection, clearSelection } = useDomSelectionToolbar(surfaceRef, true)

  return (
    <>
      <div ref={surfaceRef}>
        <p data-testid="selectable-text">Selected text inside preview</p>
      </div>
      <SelectionContextToolbar
        selection={selection}
        actions={[
          {
            id: 'copy',
            label: 'Copy selection',
            icon: <CopyIcon size={14} />,
            onSelect,
          },
        ]}
        onDismiss={clearSelection}
      />
    </>
  )
}

function MonacoSelectionHarness({ onSelect }: { onSelect: (text: string) => void }) {
  const editor = useMemo(() => {
    const domNode = document.createElement('div')
    domNode.getBoundingClientRect = () => new window.DOMRect(40, 60, 480, 240)

    return {
      getModel: () => ({
        getValueInRange: () => 'const id = "abc123"',
      }),
      getSelection: () => ({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 20,
        isEmpty: () => false,
        getStartPosition: () => ({ lineNumber: 1, column: 1 }),
        getEndPosition: () => ({ lineNumber: 1, column: 20 }),
      }),
      getDomNode: () => domNode,
      getScrolledVisiblePosition: () => ({ left: 120, top: 32, height: 18 }),
      onDidBlurEditorWidget: () => ({ dispose: vi.fn() }),
      onDidChangeCursorSelection: () => ({ dispose: vi.fn() }),
      onDidScrollChange: () => ({ dispose: vi.fn() }),
    }
  }, [])
  const { selection, clearSelection } = useMonacoSelectionToolbar(editor, true)

  return (
    <SelectionContextToolbar
      selection={selection}
      actions={[
        {
          id: 'copy',
          label: 'Copy selection',
          icon: <CopyIcon size={14} />,
          onSelect,
        },
      ]}
      onDismiss={clearSelection}
    />
  )
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges()
})

describe('SelectionContextToolbar', () => {
  it('appears for DOM text selections and passes selected text to actions', async () => {
    const onSelect = vi.fn()
    render(<SelectionHarness onSelect={onSelect} />)

    const textNode = screen.getByTestId('selectable-text').firstChild
    expect(textNode).not.toBeNull()

    const range = document.createRange()
    range.selectNodeContents(textNode!)
    range.getBoundingClientRect = () => new window.DOMRect(100, 100, 140, 18)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fireEvent.mouseUp(document)

    const toolbar = await screen.findByRole('toolbar', { name: 'Selection actions' })
    expect(toolbar).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy selection' }))

    expect(onSelect).toHaveBeenCalledWith('Selected text inside preview')
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).not.toBeInTheDocument()
    )
    expect(window.getSelection()?.rangeCount).toBe(0)
  })

  it('appears for Monaco selections and passes selected editor text to actions', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      render(<MonacoSelectionHarness onSelect={onSelect} />)
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Copy selection' }))

    expect(onSelect).toHaveBeenCalledWith('const id = "abc123"')
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).not.toBeInTheDocument()
    )
  })

  it('supports global Tab entry and Escape dismissal for keyboard users', async () => {
    const onSelect = vi.fn()
    await act(async () => {
      render(<MonacoSelectionHarness onSelect={onSelect} />)
    })

    const button = await screen.findByRole('button', { name: 'Copy selection' })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(button)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).not.toBeInTheDocument()
    )
  })
})
