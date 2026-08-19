import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'

describe('MasterDetailLayout', () => {
  it('renders the sidebar title as a heading and labels the aside with it', () => {
    render(
      <MasterDetailLayout title="Snippets" sidebar={<p>List</p>}>
        <p>Detail</p>
      </MasterDetailLayout>
    )
    expect(screen.getByRole('heading', { name: 'Snippets' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Snippets' })).toBeInTheDocument()
  })

  it('renders sidebar, subtitle, actions, and detail content', () => {
    render(
      <MasterDetailLayout
        title="Templates"
        subtitle="4 saved"
        sidebarActions={<button>New</button>}
        sidebar={<p>List</p>}
      >
        <p>Detail</p>
      </MasterDetailLayout>
    )
    expect(screen.getByText('4 saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByText('List')).toBeInTheDocument()
    expect(screen.getByText('Detail')).toBeInTheDocument()
  })

  it('renders no toggle when the sidebar is not collapsible', () => {
    render(
      <MasterDetailLayout title="Snippets" sidebar={<p>List</p>}>
        <p>Detail</p>
      </MasterDetailLayout>
    )
    expect(screen.queryByRole('button', { name: /Hide|Show/ })).not.toBeInTheDocument()
  })

  it('toggles via the collapse control and reflects state in aria-expanded', () => {
    const onToggle = vi.fn()
    render(
      <MasterDetailLayout
        title="Snippets"
        sidebar={<p>List</p>}
        sidebarOpen={false}
        onToggleSidebar={onToggle}
      >
        <p>Detail</p>
      </MasterDetailLayout>
    )
    const toggle = screen.getByRole('button', { name: 'Show Snippets' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
