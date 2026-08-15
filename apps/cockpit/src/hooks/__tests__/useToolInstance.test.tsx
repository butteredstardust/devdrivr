import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolInstanceContext, type ToolInstance } from '@/app/tool-instance'
import { useToolAction } from '@/hooks/useToolAction'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { useToolState } from '@/hooks/useToolState'
import { useToolStateCache } from '@/stores/tool-state.store'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveToolState } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn(),
}))

function instance(patch: Partial<ToolInstance> = {}): ToolInstance {
  return { tabId: 'tab-1', toolId: 'json-tools', stateKey: 'json-tools', isActive: true, ...patch }
}

beforeEach(() => {
  useToolStateCache.setState({ cache: new Map() })
})

describe('backgrounded tabs and shell events', () => {
  function Listener({ onAction }: { onAction: () => void }) {
    useToolAction(onAction)
    return null
  }

  it('delivers tool actions to the visible tab', () => {
    const onAction = vi.fn()
    render(
      <ToolInstanceContext.Provider value={instance()}>
        <Listener onAction={onAction} />
      </ToolInstanceContext.Provider>
    )

    act(() => dispatchToolAction({ type: 'save-file' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('withholds them from a tab that is only mounted, not shown', () => {
    const onAction = vi.fn()
    render(
      <ToolInstanceContext.Provider value={instance({ isActive: false })}>
        <Listener onAction={onAction} />
      </ToolInstanceContext.Provider>
    )

    act(() => dispatchToolAction({ type: 'save-file' }))

    // One ⌘S reaching four mounted tools would mean four save dialogs.
    expect(onAction).not.toHaveBeenCalled()
  })

  it('keeps delivering to shell components, which belong to no tab', () => {
    const onAction = vi.fn()
    render(<Listener onAction={onAction} />)

    act(() => dispatchToolAction({ type: 'copy-output' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  function Shortcut({ onFire }: { onFire: () => void }) {
    useKeyboardShortcut({ key: 'Enter', mod: true }, onFire)
    return null
  }

  it('only lets the visible tab answer a keyboard shortcut', () => {
    const active = vi.fn()
    const background = vi.fn()
    render(
      <>
        <ToolInstanceContext.Provider value={instance()}>
          <Shortcut onFire={active} />
        </ToolInstanceContext.Provider>
        <ToolInstanceContext.Provider value={instance({ tabId: 'tab-2', isActive: false })}>
          <Shortcut onFire={background} />
        </ToolInstanceContext.Provider>
      </>
    )

    // Both modifiers, so the assertion holds whichever platform jsdom reports.
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true, ctrlKey: true })

    expect(active).toHaveBeenCalledTimes(1)
    expect(background).not.toHaveBeenCalled()
  })
})

describe('per-tab state keys', () => {
  function Stateful({ testId }: { testId: string }) {
    const [state, update] = useToolState('json-tools', { input: '' })
    return (
      <button data-testid={testId} onClick={() => update({ input: `${state.input}x` })}>
        {state.input || 'empty'}
      </button>
    )
  }

  it('keeps two tabs of the same tool from sharing one row', () => {
    render(
      <>
        <ToolInstanceContext.Provider value={instance()}>
          <Stateful testId="first" />
        </ToolInstanceContext.Provider>
        <ToolInstanceContext.Provider
          value={instance({ tabId: 'tab-2', stateKey: 'json-tools#tab-2' })}
        >
          <Stateful testId="second" />
        </ToolInstanceContext.Provider>
      </>
    )

    fireEvent.click(screen.getByTestId('first'))

    expect(screen.getByTestId('first')).toHaveTextContent('x')
    expect(screen.getByTestId('second')).toHaveTextContent('empty')
    expect(useToolStateCache.getState().get('json-tools')).toEqual({ input: 'x' })
    expect(useToolStateCache.getState().get('json-tools#tab-2')).toBeUndefined()
  })

  it('picks up a handoff while it is mounted but hidden', () => {
    render(
      <ToolInstanceContext.Provider value={instance({ isActive: false })}>
        <Stateful testId="first" />
      </ToolInstanceContext.Provider>
    )

    // Keep-alive means the destination of a "send to tool" is usually already
    // mounted, so a cache write it never looks at again is a silent no-op.
    act(() => useToolStateCache.getState().seed('json-tools', { input: 'handed over' }))

    expect(screen.getByTestId('first')).toHaveTextContent('handed over')
    // Quitting the app skips the unmount save, so the handoff is written now.
    expect(saveToolState).toHaveBeenCalledWith('json-tools', { input: 'handed over' })
  })

  it('ignores a handoff addressed to a different tab', () => {
    render(
      <ToolInstanceContext.Provider value={instance()}>
        <Stateful testId="first" />
      </ToolInstanceContext.Provider>
    )

    act(() => useToolStateCache.getState().seed('json-tools#tab-2', { input: 'not yours' }))

    expect(screen.getByTestId('first')).toHaveTextContent('empty')
  })

  it('reads the row the tool wrote before tabs could be duplicated', () => {
    useToolStateCache.setState({ cache: new Map([['json-tools', { input: 'from last session' }]]) })

    render(
      <ToolInstanceContext.Provider value={instance()}>
        <Stateful testId="first" />
      </ToolInstanceContext.Provider>
    )

    expect(screen.getByTestId('first')).toHaveTextContent('from last session')
  })
})
