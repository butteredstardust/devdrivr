import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SplitPane } from '@/components/shared/SplitPane'

function renderSplit(props: Partial<React.ComponentProps<typeof SplitPane>> = {}) {
  return render(
    <SplitPane {...props}>
      {[<div key="a">Left pane</div>, <div key="b">Right pane</div>]}
    </SplitPane>
  )
}

describe('SplitPane', () => {
  beforeEach(() => window.localStorage.clear())

  it('renders both panes', () => {
    renderSplit()
    expect(screen.getByText('Left pane')).toBeInTheDocument()
    expect(screen.getByText('Right pane')).toBeInTheDocument()
  })

  it('exposes the divider as a separator with a value', () => {
    renderSplit({ defaultRatio: 0.5 })
    const separator = screen.getByRole('separator')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    expect(separator).toHaveAttribute('aria-valuenow', '50')
  })

  it('resizes with arrow keys — a mouse-only divider excludes keyboard users', () => {
    renderSplit({ defaultRatio: 0.5 })
    const separator = screen.getByRole('separator')
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(separator).toHaveAttribute('aria-valuenow', '52')
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '50')
  })

  it('clamps at minRatio so a pane cannot be collapsed to nothing', () => {
    renderSplit({ defaultRatio: 0.5, minRatio: 0.2 })
    const separator = screen.getByRole('separator')
    fireEvent.keyDown(separator, { key: 'Home' })
    expect(separator).toHaveAttribute('aria-valuenow', '20')
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(separator).toHaveAttribute('aria-valuenow', '20')
  })

  it('resets to the default ratio on Enter', () => {
    renderSplit({ defaultRatio: 0.6 })
    const separator = screen.getByRole('separator')
    fireEvent.keyDown(separator, { key: 'End' })
    expect(separator).not.toHaveAttribute('aria-valuenow', '60')
    fireEvent.keyDown(separator, { key: 'Enter' })
    expect(separator).toHaveAttribute('aria-valuenow', '60')
  })

  it('persists the ratio under the storage key and restores it', () => {
    const { unmount } = renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(window.localStorage.getItem('cockpit.split.demo')).toBe('0.5200')
    unmount()

    renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '52')
  })

  it('does not persist without a storage key', () => {
    renderSplit({ defaultRatio: 0.5 })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(window.localStorage.length).toBe(0)
  })

  it('uses row orientation when vertical', () => {
    renderSplit({ direction: 'vertical' })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })
})
