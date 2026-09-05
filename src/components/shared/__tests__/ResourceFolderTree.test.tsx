import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ResourceFolderTree } from '@/components/shared/ResourceFolderTree'
import type { ResourceFolder } from '@/types/models'

const root: ResourceFolder = {
  id: 'root',
  name: 'Inbox',
  parentId: null,
  kind: 'snippets',
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
}
const sibling: ResourceFolder = {
  ...root,
  id: 'sibling',
  name: 'Work',
  sortOrder: 1,
}
const child: ResourceFolder = {
  ...root,
  id: 'child',
  name: 'API',
  parentId: 'root',
  sortOrder: 1,
}

function renderTree(overrides: Partial<ComponentProps<typeof ResourceFolderTree>> = {}) {
  const props: ComponentProps<typeof ResourceFolderTree> = {
    folders: [root, child, sibling],
    selectedFolderId: 'root',
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue({ ...child, id: 'new', name: 'New folder' }),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onMove: vi.fn().mockResolvedValue(undefined),
    itemCounts: new Map([
      ['root', 2],
      ['child', 1],
    ]),
    languageOptions: ['typescript', 'rust'],
    label: 'Snippet folders',
    ...overrides,
  }
  render(<ResourceFolderTree {...props} />)
  return props
}

describe('ResourceFolderTree', () => {
  it('renders an accessible nested tree and All Items view', () => {
    renderTree()
    expect(screen.getByRole('tree', { name: 'Snippet folders' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inbox, 2 items' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /API/ })).toHaveAttribute('aria-level', '2')
    expect(screen.getByRole('button', { name: 'All Items' })).toBeInTheDocument()
  })

  it('supports inline rename and a snippet default language', async () => {
    const props = renderTree()
    fireEvent.click(screen.getByRole('button', { name: 'Rename Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename folder Work' })
    fireEvent.change(input, { target: { value: 'Projects' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Default language for Work' }), {
      target: { value: 'rust' },
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(props.onUpdate).toHaveBeenCalledWith('sibling', {
        name: 'Projects',
        defaultLanguage: 'rust',
      })
    )
  })

  it('moves folders with keyboard and pointer-operated controls', async () => {
    const props = renderTree()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Work, 0 items' }), {
      key: 'ArrowRight',
      altKey: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move Work up' }))

    await waitFor(() => {
      expect(props.onMove).toHaveBeenCalledWith('sibling', 'root', 1)
      expect(props.onMove).toHaveBeenCalledWith('sibling', null, 0)
    })
  })

  it('creates a child under the selected folder and enters rename mode', async () => {
    const props = renderTree()
    fireEvent.click(screen.getByRole('button', { name: 'New nested folder' }))

    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('root'))
    expect(props.onSelect).toHaveBeenCalledWith('new')
  })
})
