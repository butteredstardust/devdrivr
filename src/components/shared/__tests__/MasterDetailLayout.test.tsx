import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('makes the collapsed pane inert so its controls leave the tab order', () => {
    const { rerender } = render(
      <MasterDetailLayout
        title="Snippets"
        sidebar={<button>Pick one</button>}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
      >
        <p>Detail</p>
      </MasterDetailLayout>
    )
    // The collapsed pane is only `w-0 opacity-0 pointer-events-none`, which hides it from the
    // eye and the mouse but leaves this button tabbable and announced.
    expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveAttribute('inert')

    rerender(
      <MasterDetailLayout
        title="Snippets"
        sidebar={<button>Pick one</button>}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      >
        <p>Detail</p>
      </MasterDetailLayout>
    )
    expect(screen.getByRole('complementary', { name: 'Snippets' })).not.toHaveAttribute('inert')
  })

  describe('resizing', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('grows no control when the caller stores no width', () => {
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>}>
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    })

    it('renders a labelled divider when the caller stores a width', () => {
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      const divider = screen.getByRole('separator', { name: 'Resize Snippets' })
      expect(divider).toHaveAttribute('aria-orientation', 'vertical')
      // Pointer-only resizing leaves the width unreachable by keyboard.
      expect(divider).toHaveAttribute('tabindex', '0')
    })

    it('restores the stored width and widens past the old fixed 256px column', () => {
      window.localStorage.setItem('devdrivr.master-width.snippets', '520')
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
        width: '520px',
      })
    })

    it('widens on ArrowRight and persists the result', () => {
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
      expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
        width: '272px',
      })
      expect(window.localStorage.getItem('devdrivr.master-width.snippets')).toBe('272')
    })

    it('holds the floor on ArrowLeft so the list cannot be dragged shut', () => {
      window.localStorage.setItem('devdrivr.master-width.snippets', '190')
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      const divider = screen.getByRole('separator')
      fireEvent.keyDown(divider, { key: 'ArrowLeft' })
      fireEvent.keyDown(divider, { key: 'ArrowLeft' })
      expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
        width: '180px',
      })
    })

    it('ignores a corrupt stored width rather than rendering an unusable pane', () => {
      window.localStorage.setItem('devdrivr.master-width.snippets', 'not-a-number')
      render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
        width: '256px',
      })
    })

    it('keeps each tool on its own stored width', () => {
      window.localStorage.setItem('devdrivr.master-width.snippets', '300')
      window.localStorage.setItem('devdrivr.master-width.notes', '440')
      const { unmount } = render(
        <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
        width: '300px',
      })
      unmount()

      render(
        <MasterDetailLayout title="Notes" sidebar={<p>List</p>} widthStorageKey="notes">
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.getByRole('complementary', { name: 'Notes' })).toHaveStyle({ width: '440px' })
    })

    describe('in a measured row', () => {
      // jsdom reports every element as 0x0 and ships no ResizeObserver, so the window-relative
      // ceiling is unreachable without both stubs. The component measures once in a layout effect
      // and then observes, so the initial `getBoundingClientRect` is enough to drive these.
      const measureRow = (rootWidth: number) => {
        vi.stubGlobal(
          'ResizeObserver',
          class {
            observe() {}
            unobserve() {}
            disconnect() {}
          }
        )
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
          width: rootWidth,
          height: 600,
        } as DOMRect)
      }

      afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
      })

      it('holds the detail pane floor rather than the stored width', () => {
        window.localStorage.setItem('devdrivr.master-width.snippets', '800')
        measureRow(900)
        render(
          <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
            <p>Detail</p>
          </MasterDetailLayout>
        )
        // 900 - 340 of detail floor.
        expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
          width: '560px',
        })
        // The narrowed value is never written back, so widening the window restores the 800 the
        // user chose.
        expect(window.localStorage.getItem('devdrivr.master-width.snippets')).toBe('800')
      })

      it('starts a keyboard resize from the rendered width, not the stored one', () => {
        window.localStorage.setItem('devdrivr.master-width.snippets', '800')
        measureRow(900)
        render(
          <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
            <p>Detail</p>
          </MasterDetailLayout>
        )
        // Stepping from the stored 800 would land on 784, still above the 560 ceiling, and move
        // nothing. The user would press the key and watch the edge stay put.
        fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
        expect(screen.getByRole('complementary', { name: 'Snippets' })).toHaveStyle({
          width: '544px',
        })
      })

      it('advertises a range the announced width falls inside', () => {
        window.localStorage.setItem('devdrivr.master-width.snippets', '800')
        measureRow(900)
        render(
          <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
            <p>Detail</p>
          </MasterDetailLayout>
        )
        const divider = screen.getByRole('separator')
        expect(divider).toHaveAttribute('aria-valuenow', '560')
        expect(divider).toHaveAttribute('aria-valuemax', '560')
        expect(divider).toHaveAttribute('aria-valuemin', '180')
      })

      it('names the pane it resizes', () => {
        measureRow(1200)
        render(
          <MasterDetailLayout title="Snippets" sidebar={<p>List</p>} widthStorageKey="snippets">
            <p>Detail</p>
          </MasterDetailLayout>
        )
        const pane = screen.getByRole('complementary', { name: 'Snippets' })
        expect(screen.getByRole('separator')).toHaveAttribute('aria-controls', pane.id)
      })
    })

    it('hides the divider while the pane floats over the detail side', () => {
      // The overlay covers the pane a divider would resize against.
      render(
        <MasterDetailLayout
          title="Snippets"
          sidebar={<p>List</p>}
          widthStorageKey="snippets"
          sidebarOpen={false}
          onToggleSidebar={vi.fn()}
        >
          <p>Detail</p>
        </MasterDetailLayout>
      )
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    })
  })
})
