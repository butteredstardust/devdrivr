import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
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
  const view: RenderResult = render(<ResourceFolderTree {...props} />)
  return {
    ...props,
    rerender: (next: Partial<typeof props>) =>
      view.rerender(<ResourceFolderTree {...props} {...next} />),
  }
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

  it('keeps a collapsed root folder collapsed after a folder update', () => {
    const tree = renderTree()
    expect(screen.getByRole('button', { name: 'API, 1 item' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Inbox' }))
    expect(screen.queryByRole('button', { name: 'API, 1 item' })).not.toBeInTheDocument()

    tree.rerender({ folders: [root, child, { ...sibling, name: 'Projects' }] })

    expect(screen.getByRole('button', { name: 'Projects, 0 items' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'API, 1 item' })).not.toBeInTheDocument()
  })

  it('expands a root folder the first time it appears', () => {
    const tree = renderTree({ folders: [root, child] })
    const added: ResourceFolder = { ...root, id: 'added', name: 'Archive' }

    tree.rerender({
      folders: [root, child, added, { ...child, id: 'nested', parentId: 'added', name: 'Old' }],
    })

    expect(screen.getByRole('button', { name: 'Old, 0 items' })).toBeInTheDocument()
  })

  it('disables move controls that cannot change the folder position', () => {
    renderTree({ folders: [{ ...root, id: 'snippets-inbox' }, sibling] })

    expect(screen.getByRole('button', { name: 'Move Work up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Work down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Work out' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nest Work' })).toBeEnabled()
  })

  it('enables the move controls a nested folder can use', () => {
    renderTree()

    expect(screen.getByRole('button', { name: 'Move API out' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Nest API' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move API up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move API down' })).toBeDisabled()
  })

  it('ignores a keyboard move the buttons disable', () => {
    const props = renderTree({ folders: [{ ...root, id: 'snippets-inbox' }, sibling] })
    const row = screen.getByRole('button', { name: 'Work, 0 items' })

    // The Inbox holds the first root slot, so Work is already as high as it goes.
    fireEvent.keyDown(row, { key: 'ArrowUp', altKey: true })
    // Work is last, so it cannot move down either.
    fireEvent.keyDown(row, { key: 'ArrowDown', altKey: true })

    expect(props.onMove).not.toHaveBeenCalled()
  })

  it('offers folder trash without exposing the system Inbox', () => {
    const onTrash = vi.fn()
    renderTree({
      folders: [{ ...root, id: 'snippets-inbox' }, sibling],
      onTrash,
    })

    expect(screen.queryByRole('button', { name: 'Move Inbox to Trash' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move Work to Trash' }))
    expect(onTrash).toHaveBeenCalledWith(sibling)
  })
})
