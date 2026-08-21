import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShortcutsModal } from '@/components/shell/ShortcutsModal'
import { useUiStore } from '@/stores/ui.store'

beforeEach(() => {
  useUiStore.setState({ shortcutsModalOpen: true })
})

afterEach(() => {
  cleanup()
  useUiStore.setState({ shortcutsModalOpen: false })
})

describe('ShortcutsModal — filter', () => {
  it('shows every category before anything is typed', () => {
    render(<ShortcutsModal />)

    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tabs' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Window' })).toBeInTheDocument()
  })

  it('narrows to matching rows and drops categories that end up empty', () => {
    render(<ShortcutsModal />)

    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'notes' } })

    expect(screen.getByText('Toggle notes drawer')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Window' })).not.toBeInTheDocument()
  })

  it('matches the rendered shortcut, not just the action name', () => {
    render(<ShortcutsModal />)

    // "palette" is not in the combo and "mod+k" is not in the action text — the
    // filter has to look at both for either query to work.
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'mod+k' } })

    expect(screen.getByText('Command palette')).toBeInTheDocument()
    expect(screen.queryByText('Toggle sidebar')).not.toBeInTheDocument()
  })

  it('says so when nothing matches instead of showing a blank panel', () => {
    render(<ShortcutsModal />)

    fireEvent.change(screen.getByLabelText('Filter shortcuts'), { target: { value: 'zzzz' } })

    expect(screen.getByText('No matching shortcuts')).toBeInTheDocument()
  })
})
