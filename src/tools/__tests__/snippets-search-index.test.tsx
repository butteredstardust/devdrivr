/**
 * The Fuse index reads every snippet's content and every fragment's content, so building it is
 * the most expensive thing the search box can trigger. It must be built from the library, not
 * from the query — a query in its dependencies rebuilds the whole corpus on each keystroke, and
 * typing then gets slower as the library grows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from '@/tools/__tests__/test-utils'
import { useSnippetsStore } from '@/stores/snippets.store'
import SnippetsManager from '@/tools/snippets/SnippetsManager'

const construct = vi.hoisted(() => vi.fn())

vi.mock('fuse.js', async () => {
  // Delegate to the real Fuse so search results stay honest; the mock only counts builds.
  const actual = await vi.importActual<typeof import('fuse.js')>('fuse.js')
  const Real = actual.default
  class CountingFuse<T> extends Real<T> {
    constructor(items: readonly T[], options?: ConstructorParameters<typeof Real<T>>[1]) {
      construct(items.length)
      super(items, options)
    }
  }
  return { ...actual, default: CountingFuse }
})

function snippet(id: string, title: string) {
  return {
    id,
    title,
    content: `const ${id} = true`,
    language: 'javascript',
    tags: [],
    favorite: false,
    folder: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

beforeEach(() => {
  construct.mockClear()
  useSnippetsStore.setState({
    snippets: [snippet('alpha', 'Alpha helper'), snippet('beta', 'Beta helper')],
    initialized: true,
    saving: false,
    activeFolder: '',
  })
})

describe('SnippetsManager search index', () => {
  it('builds the index once no matter how long the query gets', async () => {
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Alpha helper')

    const search = screen.getByRole('searchbox', { name: /search snippets/i })
    fireEvent.change(search, { target: { value: 'a' } })
    const afterFirstKeystroke = construct.mock.calls.length
    expect(afterFirstKeystroke).toBeGreaterThan(0)

    fireEvent.change(search, { target: { value: 'al' } })
    fireEvent.change(search, { target: { value: 'alp' } })
    fireEvent.change(search, { target: { value: 'alph' } })

    // Three more characters must not cost three more index builds.
    expect(construct.mock.calls.length).toBe(afterFirstKeystroke)
  })

  it('still searches the library it indexed', async () => {
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Alpha helper')

    const search = screen.getByRole('searchbox', { name: /search snippets/i })
    fireEvent.change(search, { target: { value: 'Beta' } })

    // Matched text is wrapped in <mark>, which splits it across nodes, so match on the
    // container's textContent rather than on a single text node.
    const list = await screen.findByRole('listbox', { name: /snippets/i })
    expect(list.textContent).toContain('Beta helper')
    expect(list.textContent).not.toContain('Alpha helper')
  })

  it('rebuilds the index when the library changes', async () => {
    renderTool(SnippetsManager)
    await screen.findByDisplayValue('Alpha helper')

    const search = screen.getByRole('searchbox', { name: /search snippets/i })
    fireEvent.change(search, { target: { value: 'helper' } })
    const beforeAdd = construct.mock.calls.length

    act(() => {
      useSnippetsStore.setState({
        snippets: [
          snippet('alpha', 'Alpha helper'),
          snippet('beta', 'Beta helper'),
          snippet('gamma', 'Gamma helper'),
        ],
      })
    })

    // A new snippet must reach the index, or searching would never find it.
    await waitFor(() => expect(construct.mock.calls.length).toBeGreaterThan(beforeAdd))
    expect(construct.mock.calls.at(-1)?.[0]).toBe(3)
  })
})
