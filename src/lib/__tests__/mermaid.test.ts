import { beforeEach, describe, expect, it, vi } from 'vitest'

const mermaidMock = vi.hoisted(() => ({ initialize: vi.fn() }))

vi.mock('mermaid', () => ({ default: mermaidMock }))

beforeEach(() => {
  vi.resetModules()
  mermaidMock.initialize.mockClear()
})

describe('loadMermaid', () => {
  it('applies the SVG label config for every theme', async () => {
    const { loadMermaid } = await import('@/lib/mermaid')

    await loadMermaid('dark')
    await loadMermaid('default')

    for (const [config] of mermaidMock.initialize.mock.calls) {
      expect(config).toMatchObject({
        startOnLoad: false,
        flowchart: { htmlLabels: false },
        class: { htmlLabels: false },
      })
    }
    expect(mermaidMock.initialize).toHaveBeenCalledTimes(2)
  })

  it('initializes once per theme change', async () => {
    const { loadMermaid } = await import('@/lib/mermaid')

    await loadMermaid('dark')
    await loadMermaid('dark')

    expect(mermaidMock.initialize).toHaveBeenCalledOnce()
  })
})
