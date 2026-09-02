import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
    vi.useFakeTimers()
    const { unmount } = renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })

    // The write waits for the resize to settle — a drag commits on every
    // mousemove, and localStorage is a synchronous main-thread call.
    expect(window.localStorage.getItem('devdrivr.split.demo')).toBeNull()
    act(() => void vi.advanceTimersByTime(500))
    expect(window.localStorage.getItem('devdrivr.split.demo')).toBe('0.5200')
    unmount()
    vi.useRealTimers()

    renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '52')
  })

  it('flushes a pending ratio when the split unmounts mid-settle', () => {
    vi.useFakeTimers()
    const { unmount } = renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    // Closing the tool inside the debounce window must not discard the resize.
    unmount()
    vi.useRealTimers()

    expect(window.localStorage.getItem('devdrivr.split.demo')).toBe('0.5200')
  })

  it('does not write again after the pending ratio is flushed', () => {
    vi.useFakeTimers()
    const { unmount } = renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    act(() => void vi.advanceTimersByTime(500))
    window.localStorage.setItem('devdrivr.split.demo', 'sentinel')
    unmount()
    vi.useRealTimers()

    expect(window.localStorage.getItem('devdrivr.split.demo')).toBe('sentinel')
  })

  it('clamps a corrupt persisted ratio before the first render', () => {
    window.localStorage.setItem('devdrivr.split.demo', '2')
    renderSplit({ defaultRatio: 0.5, minRatio: 0.2, storageKey: 'demo' })

    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '80')
  })

  it('falls back to an even split when the persisted ratio is not a number', () => {
    window.localStorage.setItem('devdrivr.split.demo', 'not-a-ratio')
    renderSplit({ defaultRatio: 0.5, storageKey: 'demo' })

    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
  })

  it('clamps an out-of-range defaultRatio', () => {
    renderSplit({ defaultRatio: -3, minRatio: 0.25 })

    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '25')
  })

  it('ignores a minRatio that would invert the clamp', () => {
    renderSplit({ defaultRatio: 0.5, minRatio: 5 })

    // 0.49 is the largest minimum that still leaves the other pane something.
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuemin', '49')
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
  })

  it('does not persist without a storage key', () => {
    renderSplit({ defaultRatio: 0.5 })
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(window.localStorage.length).toBe(0)
  })

  it('stacks with no divider below stackBelow', () => {
    // A ratio applied as an inline width beats any Tailwind breakpoint, so without this the tools
    // that stack at 900px could not adopt SplitPane without losing their responsive behaviour.
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    renderSplit({ stackBelow: 900 })
    expect(screen.getByText('Left pane')).toBeInTheDocument()
    expect(screen.getByText('Right pane')).toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    window.matchMedia = original
  })

  // The regression this pins: stacking used to be a separate `return` with two children instead of
  // three, so `second` moved from child index 2 to index 1 and React — which reconciles
  // positionally — unmounted it. Six of the tools that stack put a Monaco editor in a pane, where a
  // remount silently discards cursor, scroll and undo history. Dragging a window across 900px did
  // it every time. The static stacked-render test above passes either way, so it caught nothing.
  it('keeps both panes mounted when the viewport crosses stackBelow', () => {
    const original = window.matchMedia
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    let matches = false

    window.matchMedia = ((query: string) => ({
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia

    const mounts: string[] = []
    // A probe that records every mount. Two mounts of the same name means it was torn down and
    // rebuilt — exactly the state loss a stateful pane would suffer.
    function Probe({ name }: { name: string }) {
      useEffect(() => {
        mounts.push(name)
      }, [name])
      return <div>{name}</div>
    }

    render(
      <SplitPane stackBelow={900}>
        {[<Probe key="a" name="first" />, <Probe key="b" name="second" />]}
      </SplitPane>
    )
    expect(mounts).toEqual(['first', 'second'])

    // Narrow past the breakpoint, then back out again.
    act(() => {
      matches = true
      listeners.forEach((fn) => fn({ matches: true } as MediaQueryListEvent))
    })
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    act(() => {
      matches = false
      listeners.forEach((fn) => fn({ matches: false } as MediaQueryListEvent))
    })
    expect(screen.getByRole('separator')).toBeInTheDocument()

    expect(mounts).toEqual(['first', 'second'])
    window.matchMedia = original
  })

  it('keeps both panes mounted while switching single-pane visibility', () => {
    const mounts: string[] = []
    function Probe({ name }: { name: string }) {
      useEffect(() => {
        mounts.push(name)
      }, [name])
      return <div>{name}</div>
    }

    const { rerender } = render(
      <SplitPane firstVisible secondVisible={false}>
        {[<Probe key="a" name="editor" />, <Probe key="b" name="preview" />]}
      </SplitPane>
    )
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    rerender(
      <SplitPane firstVisible={false} secondVisible>
        {[<Probe key="a" name="editor" />, <Probe key="b" name="preview" />]}
      </SplitPane>
    )
    rerender(
      <SplitPane firstVisible secondVisible>
        {[<Probe key="a" name="editor" />, <Probe key="b" name="preview" />]}
      </SplitPane>
    )

    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(mounts).toEqual(['editor', 'preview'])
  })

  it('uses row orientation when vertical', () => {
    renderSplit({ direction: 'vertical' })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })
})
