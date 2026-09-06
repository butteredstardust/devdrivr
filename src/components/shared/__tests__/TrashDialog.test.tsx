import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrashDialog, type TrashEntry } from '@/components/shared/TrashDialog'

const folder: TrashEntry = {
  id: 'folder-1',
  name: 'Archived work',
  detail: 'Folder',
  type: 'folder',
}

describe('TrashDialog', () => {
  it('restores an entry without requiring destructive confirmation', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined)
    render(
      <TrashDialog
        title="Notes Trash"
        entries={[folder]}
        onClose={vi.fn()}
        onRestore={onRestore}
        onDeletePermanently={vi.fn()}
        onEmpty={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restore Archived work' }))

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(folder))
  })

  it('confirms permanent deletion and emptying Trash', async () => {
    const onDeletePermanently = vi.fn().mockResolvedValue(undefined)
    const onEmpty = vi.fn().mockResolvedValue(undefined)
    const props = {
      title: 'Notes Trash',
      entries: [folder],
      onClose: vi.fn(),
      onRestore: vi.fn().mockResolvedValue(undefined),
      onDeletePermanently,
      onEmpty,
    }
    const { rerender } = render(<TrashDialog {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Archived work permanently' }))
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
    await waitFor(() => expect(onDeletePermanently).toHaveBeenCalledWith(folder))

    rerender(<TrashDialog {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }))
    fireEvent.click(screen.getByRole('button', { name: 'Empty Trash' }))
    await waitFor(() => expect(onEmpty).toHaveBeenCalledOnce())
  })

  it('shows an empty state and disables empty Trash', () => {
    render(
      <TrashDialog
        title="API Trash"
        entries={[]}
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onDeletePermanently={vi.fn()}
        onEmpty={vi.fn()}
      />
    )

    expect(screen.getByText('Trash is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empty Trash' })).toBeDisabled()
  })
})
