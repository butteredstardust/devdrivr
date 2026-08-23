import { useState } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Button } from '@/components/shared/Button'
import { Popover } from '@/components/shared/Popover'
import {
  DocumentIdentity,
  DocumentToolbar,
  planCollapse,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
} from '@/components/shared/Toolbar'

describe('Toolbar', () => {
  it('renders children in a row', () => {
    render(
      <Toolbar>
        <button>Format</button>
        <button>Minify</button>
      </Toolbar>
    )
    expect(screen.getByRole('button', { name: 'Format' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minify' })).toBeInTheDocument()
  })

  it('draws a bottom border by default and omits it when border=false', () => {
    const { container: withBorder } = render(<Toolbar>content</Toolbar>)
    const { container: noBorder } = render(<Toolbar border={false}>content</Toolbar>)
    expect(withBorder.firstElementChild?.className).toContain('border-b')
    expect(noBorder.firstElementChild?.className).not.toContain('border-b')
  })

  // The divider rule lives in the primitives, not in each tool. Eight of thirteen call sites had
  // independently passed `border={false}` to a DocumentToolbar, leaving a third of the app with a
  // seam under its toolbar and two-thirds without.
  it('gives a document toolbar no divider by default, unlike a plain toolbar', () => {
    const { container: plain } = render(<Toolbar>content</Toolbar>)
    const { container: doc } = render(<DocumentToolbar>content</DocumentToolbar>)
    const { container: docForced } = render(<DocumentToolbar border>content</DocumentToolbar>)

    expect(plain.firstElementChild?.className).toContain('border-b')
    expect(doc.firstElementChild?.className).not.toContain('border-b')
    // A document toolbar that genuinely stacks above another row can still opt in.
    expect(docForced.firstElementChild?.className).toContain('border-b')
  })

  it('labels related action groups and provides a flexible spacer', () => {
    const { container } = render(
      <Toolbar aria-label="Editor actions">
        <ToolbarGroup label="Document actions">
          <button>Save</button>
        </ToolbarGroup>
        <ToolbarSpacer />
      </Toolbar>
    )

    expect(screen.getByRole('toolbar', { name: 'Editor actions' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Document actions' })).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('flex-1')
  })

  it('keeps document identity and status inside compact wrapping chrome', () => {
    render(
      <DocumentToolbar aria-label="Document actions">
        <DocumentIdentity
          title="styles.css"
          stateLabel="Modified"
          stateChanged
          status="No problems"
        />
        <button>Save</button>
      </DocumentToolbar>
    )

    // `min-h-11` matches the title bar's `h-11` — the chrome stack shares one height.
    expect(screen.getByRole('toolbar', { name: 'Document actions' })).toHaveClass('min-h-11')
    expect(screen.getByText('styles.css')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No problems')
    expect(screen.getByText('Modified')).toHaveClass('text-[var(--color-accent)]')
    expect(screen.getByText('Modified')).toHaveAttribute('aria-live', 'polite')
  })

  it('leaves static context out of the live region', () => {
    render(<DocumentIdentity title="notes.md" status="~/notes.md" statusLive={false} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('~/notes.md')).toBeInTheDocument()
  })
})

describe('planCollapse', () => {
  const plan = (
    available: number,
    groupWidths: number[],
    overrides: Partial<Parameters<typeof planCollapse>[0]> = {}
  ) =>
    planCollapse({
      available,
      fixedWidth: 100,
      groupWidths,
      moreWidth: 34,
      gap: 8,
      childCount: groupWidths.length + 1,
      ...overrides,
    })

  it('keeps every group when the row fits', () => {
    // 100 fixed + 240 groups + 2 gaps = 356
    expect(plan(356, [120, 120])).toBe(0)
  })

  it('sheds trailing groups from the right until the row fits', () => {
    // Collapsing one: 100 + 120 kept + trigger 34, gaps net out — 254.
    expect(plan(355, [120, 120])).toBe(1)
    // Collapsing two: 100 fixed + 34 trigger + 1 remaining gap — 142.
    expect(plan(253, [120, 120])).toBe(2)
  })

  it('collapses every group rather than overflowing, even when nothing fits', () => {
    expect(plan(10, [120, 120])).toBe(2)
  })

  it('returns zero when there is nothing to collapse', () => {
    expect(
      planCollapse({
        available: 0,
        fixedWidth: 100,
        groupWidths: [],
        moreWidth: 34,
        gap: 8,
        childCount: 1,
      })
    ).toBe(0)
  })
})

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  callback: ResizeObserverCallback
  targets = new Set<Element>()
  deliveredInitial = false

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  /**
   * A real ResizeObserver delivers one callback as soon as it starts observing. Omitting that
   * initial delivery is what let a desync between the rendered collapse count and the ref
   * tracking it pass this suite while every toolbar in the app overflowed: the stale ref made
   * the follow-up measurement look like "no change", so the row never collapsed at all.
   */
  observe(target: Element): void {
    this.targets.add(target)
    if (!this.deliveredInitial) {
      this.deliveredInitial = true
      this.callback([], this as unknown as ResizeObserver)
    }
  }
  unobserve(target: Element): void {
    this.targets.delete(target)
  }
  disconnect(): void {
    this.targets.clear()
  }

  trigger(target?: Element): void {
    if (target && !this.targets.has(target)) return
    this.callback([], this as unknown as ResizeObserver)
  }
}

function NestedPopoverGroup({ onAction }: { onAction: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Toolbar aria-label="Nested overflow">
      <ToolbarGroup label="Settings">
        <Popover
          open={open}
          onOpenChange={setOpen}
          label="Nested settings"
          trigger={(props) => <Button {...props}>Configure</Button>}
        >
          <Button
            onClick={() => {
              onAction()
              setOpen(false)
            }}
          >
            Apply setting
          </Button>
        </Popover>
      </ToolbarGroup>
    </Toolbar>
  )
}

function DynamicGroup() {
  const [wide, setWide] = useState(false)
  return (
    <Toolbar aria-label="Dynamic overflow">
      <Button onClick={() => setWide(true)}>Change</Button>
      <ToolbarGroup label="Dynamic">
        <Button>{wide ? 'A much wider action label' : 'Short'}</Button>
      </ToolbarGroup>
    </Toolbar>
  )
}

/** jsdom has no layout — stub the toolbar's width and each child's measured width. */
function stubLayout(toolbar: HTMLElement, clientWidth: number, childWidths: number[]) {
  Object.defineProperty(toolbar, 'clientWidth', { configurable: true, value: clientWidth })
  Array.from(toolbar.children).forEach((child, index) => {
    child.getBoundingClientRect = () => ({ width: childWidths[index] ?? 0 }) as unknown as DOMRect
  })
}

/**
 * Stub layout globally *before* mounting, so the very first measurement sees a real width.
 * `stubLayout` can only run after render, which means the mount-time pass reads a zero-width
 * row and bails — the one path where collapse and the observer's initial callback interact.
 */
function installGlobalLayout(toolbarWidth: number, groupWidth: number, fixedWidth: number) {
  const { Element, HTMLElement } = window
  const originalRect = Element.prototype.getBoundingClientRect
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'toolbar' ? toolbarWidth : 0
    },
  })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const width = this.hasAttribute('data-toolbar-group') ? groupWidth : fixedWidth
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 } as DOMRect
  }

  return () => {
    Element.prototype.getBoundingClientRect = originalRect
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
    }
  }
}

describe('Toolbar overflow', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    // jsdom has neither ResizeObserver nor rAF — the observer stub drives measurement,
    // and a synchronous rAF makes each resize pass deterministic.
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
    })
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0)
        return 0
      },
    })
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: () => {},
    })
  })

  it('folds trailing groups into a "More actions" menu when the row runs out of width', () => {
    render(
      <Toolbar aria-label="Overflow">
        <button>Fixed</button>
        <ToolbarGroup label="First">
          <button>First action</button>
        </ToolbarGroup>
        <ToolbarGroup label="Second">
          <button>Second action</button>
        </ToolbarGroup>
      </Toolbar>
    )
    // 100 + 120 + 120 needs 340; without the second group the row needs 254.
    stubLayout(screen.getByRole('toolbar', { name: 'Overflow' }), 260, [100, 120, 120])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Overflow' })
    expect(screen.getByTestId('toolbar-more-trigger')).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'First action' })).toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: 'Second action' })).toBeNull()

    fireEvent.click(screen.getByTestId('toolbar-more-trigger'))
    const menu = screen.getByRole('dialog', { name: 'More actions' })
    expect(within(menu).getByRole('button', { name: 'Second action' })).toBeInTheDocument()
    expect(within(menu).getByRole('region', { name: 'Second' })).toBeInTheDocument()
  })

  it('closes the menu when a collapsed action is activated', () => {
    render(
      <Toolbar aria-label="Overflow">
        <ToolbarGroup label="Only">
          <button>Only action</button>
        </ToolbarGroup>
      </Toolbar>
    )
    stubLayout(screen.getByRole('toolbar', { name: 'Overflow' }), 50, [120])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })

    fireEvent.click(screen.getByTestId('toolbar-more-trigger'))
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Only action' }))
    expect(screen.queryByRole('dialog', { name: 'More actions' })).toBeNull()
  })

  it('keeps a nested popover mounted until its action is activated', () => {
    const onAction = vi.fn()
    render(<NestedPopoverGroup onAction={onAction} />)
    stubLayout(screen.getByRole('toolbar', { name: 'Nested overflow' }), 50, [120])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }))
    expect(screen.getByRole('dialog', { name: 'Nested settings' })).toBeInTheDocument()

    const action = screen.getByRole('button', { name: 'Apply setting' })
    // Match a trusted mouse click's ordering. The native mousedown listener must keep both
    // layers mounted, then the action must run before the outer menu dismisses on click bubbling.
    fireEvent.mouseDown(action)
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nested settings' })).toBeInTheDocument()
    fireEvent.mouseUp(action)
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'More actions' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Nested settings' })).toBeNull()
  })

  it('remeasures when a mounted group changes width', () => {
    render(<DynamicGroup />)
    const toolbar = screen.getByRole('toolbar', { name: 'Dynamic overflow' })
    stubLayout(toolbar, 150, [20, 50])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    stubLayout(toolbar, 150, [20, 250])
    const group = screen.getByRole('group', { name: 'Dynamic' })
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger(group)
    })

    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('restores collapsed groups when width returns', () => {
    render(
      <Toolbar aria-label="Widen">
        <button>Fixed</button>
        <ToolbarGroup label="First">
          <button>First action</button>
        </ToolbarGroup>
        <ToolbarGroup label="Second">
          <button>Second action</button>
        </ToolbarGroup>
      </Toolbar>
    )
    const toolbar = screen.getByRole('toolbar', { name: 'Widen' })
    stubLayout(toolbar, 200, [100, 120, 120])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })
    expect(screen.queryByTestId('toolbar-more-trigger')).not.toBeNull()

    stubLayout(toolbar, 400, [100, 120, 120])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })

    expect(screen.queryByTestId('toolbar-more-trigger')).toBeNull()
    expect(within(toolbar).getByRole('button', { name: 'Second action' })).toBeInTheDocument()
  })

  it('never collapses a toolbar without groups', () => {
    render(
      <Toolbar aria-label="Bare">
        <button>Fixed</button>
      </Toolbar>
    )
    stubLayout(screen.getByRole('toolbar', { name: 'Bare' }), 10, [500])
    act(() => {
      MockResizeObserver.instances.at(-1)?.trigger()
    })

    expect(screen.queryByTestId('toolbar-more-trigger')).toBeNull()
  })

  it('stays collapsed after the observer delivers its initial callback', () => {
    // The live failure: the mount pass collapses, the observer's first callback runs the
    // "expand, then re-measure" pass, and the re-measure computes the same count it started
    // with. Unless the expansion resets that bookkeeping too, the equality check reads it as
    // "nothing changed" and the row is left expanded and overflowing for good.
    const restore = installGlobalLayout(260, 120, 100)
    try {
      render(
        <Toolbar aria-label="Sticky">
          <button>Fixed</button>
          <ToolbarGroup label="First">
            <button>First action</button>
          </ToolbarGroup>
          <ToolbarGroup label="Second">
            <button>Second action</button>
          </ToolbarGroup>
        </Toolbar>
      )

      const toolbar = screen.getByRole('toolbar', { name: 'Sticky' })
      expect(screen.getByTestId('toolbar-more-trigger')).toBeInTheDocument()
      expect(within(toolbar).queryByRole('button', { name: 'Second action' })).toBeNull()
    } finally {
      restore()
    }
  })
})
