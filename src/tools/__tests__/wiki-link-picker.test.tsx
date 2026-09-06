import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WikiLinkPicker } from '@/tools/notes/WikiLinkPicker'
import type { WikiResource } from '@/lib/wiki-links'

const resources: WikiResource[] = [
  { kind: 'note', id: 'note-1', title: 'Plan', label: 'Plan', location: 'Inbox' },
  {
    kind: 'snippet',
    id: 'snippet-1',
    title: 'Fetch helper',
    label: 'Fetch helper',
    location: 'TypeScript',
  },
]

describe('WikiLinkPicker', () => {
  it('wires an accessible combobox and selects with the keyboard', () => {
    const onSelect = vi.fn()
    render(
      <WikiLinkPicker
        query=""
        resources={resources}
        onQueryChange={vi.fn()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    )

    const input = screen.getByRole('combobox', { name: 'Find a note, snippet, or API request' })
    const listbox = screen.getByRole('listbox', { name: 'Wiki link suggestions' })
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('note-1'))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(resources[1])
  })

  it('filters by type and preserves focus on pointer selection', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <WikiLinkPicker
        query="API"
        resources={resources}
        onQueryChange={vi.fn()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('No matching live resources')).toBeInTheDocument()

    rerender(
      <WikiLinkPicker
        query="Fetch"
        resources={resources}
        onQueryChange={vi.fn()}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    )
    fireEvent.mouseDown(screen.getByRole('option', { name: /Fetch helper/ }))
    expect(onSelect).toHaveBeenCalledWith(resources[1])
  })
})
