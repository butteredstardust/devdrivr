import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { _resetPlatformCache } from '@/lib/platform'
import { useOpenInstanceCount, useOpenTool } from '@/hooks/useToolOpen'
import { useUiStore } from '@/stores/ui.store'

function setUserAgent(value: string): void {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true })
  _resetPlatformCache()
}

function HookHarness({ toolId = 'tool-a' }: { toolId?: string }) {
  const openTool = useOpenTool()
  const count = useOpenInstanceCount(toolId)
  return <button onClick={(event) => openTool(toolId, event)}>Open ({count})</button>
}

const originalUserAgent = navigator.userAgent
const realSetActiveTool = useUiStore.getState().setActiveTool
const realOpenTabInstance = useUiStore.getState().openTabInstance

beforeEach(() => {
  _resetPlatformCache()
  useUiStore.setState({
    tabs: [],
    setActiveTool: realSetActiveTool,
    openTabInstance: realOpenTabInstance,
  })
})

afterEach(() => setUserAgent(originalUserAgent))

describe('useOpenTool', () => {
  it('switches tools on a plain click', () => {
    const setActiveTool = vi.fn()
    const openTabInstance = vi.fn()
    useUiStore.setState({ setActiveTool, openTabInstance } as never)
    render(<HookHarness />)

    fireEvent.click(screen.getByRole('button'))

    expect(setActiveTool).toHaveBeenCalledWith('tool-a')
    expect(openTabInstance).not.toHaveBeenCalled()
  })

  it('opens a new instance for a meta click on macOS', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const setActiveTool = vi.fn()
    const openTabInstance = vi.fn()
    useUiStore.setState({ setActiveTool, openTabInstance } as never)
    render(<HookHarness />)

    fireEvent.click(screen.getByRole('button'), { metaKey: true })

    expect(openTabInstance).toHaveBeenCalledWith('tool-a')
    expect(setActiveTool).not.toHaveBeenCalled()
  })

  it('switches for a ctrl click on macOS', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const setActiveTool = vi.fn()
    const openTabInstance = vi.fn()
    useUiStore.setState({ setActiveTool, openTabInstance } as never)
    render(<HookHarness />)

    fireEvent.click(screen.getByRole('button'), { ctrlKey: true })

    expect(setActiveTool).toHaveBeenCalledWith('tool-a')
    expect(openTabInstance).not.toHaveBeenCalled()
  })

  it.each([
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'],
    ['Linux', 'Mozilla/5.0 (X11; Linux x86_64)'],
  ])('opens a new instance for a ctrl click on %s', (_platform, userAgent) => {
    setUserAgent(userAgent)
    const setActiveTool = vi.fn()
    const openTabInstance = vi.fn()
    useUiStore.setState({ setActiveTool, openTabInstance } as never)
    render(<HookHarness />)

    fireEvent.click(screen.getByRole('button'), { ctrlKey: true })

    expect(openTabInstance).toHaveBeenCalledWith('tool-a')
    expect(setActiveTool).not.toHaveBeenCalled()
  })
})

describe('useOpenInstanceCount', () => {
  it('reports the number of open tabs for its tool', () => {
    render(<HookHarness />)
    expect(screen.getByRole('button')).toHaveTextContent('Open (0)')

    act(() => {
      useUiStore.setState({
        tabs: [
          { id: 'tab-a-1', toolId: 'tool-a' },
          { id: 'tab-b-1', toolId: 'tool-b' },
          { id: 'tab-a-2', toolId: 'tool-a' },
        ],
      })
    })

    expect(screen.getByRole('button')).toHaveTextContent('Open (2)')
  })
})
