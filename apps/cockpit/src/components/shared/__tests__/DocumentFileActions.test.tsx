import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentFileActions } from '@/components/shared/DocumentFileActions'

describe('DocumentFileActions', () => {
  it('renders available actions in canonical order with accessible tooltips', () => {
    const onOpen = vi.fn()
    render(
      <DocumentFileActions
        newDocument={{ label: 'New document', onClick: vi.fn() }}
        open={{ label: 'Open document', title: 'Open document (⌘O)', onClick: onOpen }}
        save={{ label: 'Save document', onClick: vi.fn() }}
        saveAs={{ label: 'Save document as', onClick: vi.fn() }}
      />
    )

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    ).toEqual(['New document', 'Open document', 'Save document', 'Save document as'])
    expect(screen.getByRole('button', { name: 'Open document' })).toHaveAttribute(
      'title',
      'Open document (⌘O)'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
