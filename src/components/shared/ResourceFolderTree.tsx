import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'
import type { ResourceFolder } from '@/types/models'
import { isInboxFolder } from '@/lib/resource-folders'

type FolderPatch = Partial<Pick<ResourceFolder, 'name' | 'defaultLanguage'>>

type Props = {
  folders: ResourceFolder[]
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
  onCreate: (parentId: string | null) => Promise<ResourceFolder>
  onUpdate: (id: string, patch: FolderPatch) => Promise<void>
  onMove: (id: string, parentId: string | null, index: number) => Promise<void>
  itemCounts?: ReadonlyMap<string, number>
  languageOptions?: readonly string[]
  label?: string
}

type TreeRow = { folder: ResourceFolder; level: number }

function sortedChildren(folders: ResourceFolder[], parentId: string | null): ResourceFolder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

function flattenFolders(folders: ResourceFolder[], expanded: Set<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const visit = (parentId: string | null, level: number) => {
    sortedChildren(folders, parentId).forEach((folder) => {
      rows.push({ folder, level })
      if (expanded.has(folder.id)) visit(folder.id, level + 1)
    })
  }
  visit(null, 1)
  return rows
}

export function ResourceFolderTree({
  folders,
  selectedFolderId,
  onSelect,
  onCreate,
  onUpdate,
  onMove,
  itemCounts,
  languageOptions,
  label = 'Folders',
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders.map((f) => f.id)))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftLanguage, setDraftLanguage] = useState('')
  const treeRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => flattenFolders(folders, expanded), [expanded, folders])
  const selectedFolderIsVisible = rows.some((row) => row.folder.id === selectedFolderId)

  useEffect(() => {
    setExpanded((current) => {
      const next = new Set(current)
      for (const folder of folders) if (folder.parentId === null) next.add(folder.id)
      return next
    })
  }, [folders])

  const startRename = useCallback((folder: ResourceFolder) => {
    if (isInboxFolder(folder.id)) return
    setEditingId(folder.id)
    setDraftName(folder.name)
    setDraftLanguage(folder.defaultLanguage ?? '')
  }, [])

  const commitRename = useCallback(async () => {
    if (!editingId) return
    const name = draftName.trim()
    if (name) {
      await onUpdate(editingId, {
        name,
        ...(languageOptions ? { defaultLanguage: draftLanguage || null } : {}),
      })
    }
    setEditingId(null)
  }, [draftLanguage, draftName, editingId, languageOptions, onUpdate])

  const createFolder = useCallback(async () => {
    const created = await onCreate(selectedFolderId)
    if (created.parentId) {
      setExpanded((current) => new Set(current).add(created.parentId!))
    }
    onSelect(created.id)
    startRename(created)
  }, [onCreate, onSelect, selectedFolderId, startRename])

  const moveSibling = useCallback(
    async (folder: ResourceFolder, delta: -1 | 1) => {
      const siblings = sortedChildren(folders, folder.parentId)
      const index = siblings.findIndex((candidate) => candidate.id === folder.id)
      const nextIndex = Math.max(0, Math.min(index + delta, siblings.length - 1))
      if (nextIndex !== index) await onMove(folder.id, folder.parentId, nextIndex)
    },
    [folders, onMove]
  )

  const nestUnderPrevious = useCallback(
    async (folder: ResourceFolder) => {
      const siblings = sortedChildren(folders, folder.parentId)
      const index = siblings.findIndex((candidate) => candidate.id === folder.id)
      const previous = siblings[index - 1]
      if (!previous) return
      const childCount = sortedChildren(folders, previous.id).length
      await onMove(folder.id, previous.id, childCount)
      setExpanded((current) => new Set(current).add(previous.id))
    },
    [folders, onMove]
  )

  const moveOut = useCallback(
    async (folder: ResourceFolder) => {
      if (!folder.parentId) return
      const parent = folders.find((candidate) => candidate.id === folder.parentId)
      if (!parent) return
      const parentSiblings = sortedChildren(folders, parent.parentId)
      const parentIndex = parentSiblings.findIndex((candidate) => candidate.id === parent.id)
      await onMove(folder.id, parent.parentId, parentIndex + 1)
    },
    [folders, onMove]
  )

  const focusRow = useCallback((id: string) => {
    treeRef.current?.querySelector<HTMLButtonElement>(`[data-folder-tree-id="${id}"]`)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, folder: ResourceFolder) => {
      const index = rows.findIndex((row) => row.folder.id === folder.id)
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        void moveSibling(folder, -1)
        return
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        void moveSibling(folder, 1)
        return
      }
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        void nestUnderPrevious(folder)
        return
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        void moveOut(folder)
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
        if (next) focusRow(next.folder.id)
      } else if (event.key === 'ArrowRight') {
        const children = sortedChildren(folders, folder.id)
        if (children.length === 0) return
        event.preventDefault()
        if (!expanded.has(folder.id)) {
          setExpanded((current) => new Set(current).add(folder.id))
        } else {
          focusRow(children[0]!.id)
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (expanded.has(folder.id) && sortedChildren(folders, folder.id).length > 0) {
          setExpanded((current) => {
            const next = new Set(current)
            next.delete(folder.id)
            return next
          })
        } else if (folder.parentId) {
          focusRow(folder.parentId)
        }
      } else if (event.key === 'F2') {
        event.preventDefault()
        startRename(folder)
      }
    },
    [expanded, focusRow, folders, moveOut, moveSibling, nestUnderPrevious, rows, startRename]
  )

  return (
    <section aria-label={label} className="border-b border-[var(--color-border)] p-2">
      <div className="mb-1 flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={selectedFolderId === null}
          onClick={() => onSelect(null)}
          className="min-w-0 flex-1 justify-start"
        >
          All Items
        </Button>
        <Button
          type="button"
          variant="icon"
          size="xs"
          onClick={() => void createFolder()}
          aria-label={selectedFolderId ? 'New nested folder' : 'New folder'}
          title={selectedFolderId ? 'New nested folder' : 'New folder'}
        >
          <FolderPlusIcon size={14} aria-hidden="true" />
        </Button>
      </div>
      <div ref={treeRef} role="tree" aria-label={label} className="space-y-0.5">
        {rows.map(({ folder, level }, rowIndex) => {
          const children = sortedChildren(folders, folder.id)
          const isExpanded = expanded.has(folder.id)
          const selected = selectedFolderId === folder.id
          const editing = editingId === folder.id
          const movable = !isInboxFolder(folder.id)
          return (
            <div
              key={folder.id}
              role="treeitem"
              aria-level={level}
              aria-selected={selected}
              aria-expanded={children.length > 0 ? isExpanded : undefined}
              className="group"
              style={{ paddingLeft: `${(level - 1) * 14}px` }}
            >
              {editing ? (
                <div
                  className="space-y-1 py-1"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) void commitRename()
                  }}
                >
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void commitRename()
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    aria-label={`Rename folder ${folder.name}`}
                  />
                  {languageOptions && (
                    <Select
                      value={draftLanguage}
                      onChange={(event) => setDraftLanguage(event.target.value)}
                      aria-label={`Default language for ${folder.name}`}
                    >
                      <option value="">No default language</option>
                      {languageOptions.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </Select>
                  )}
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => void commitRename()}
                      aria-label="Save folder changes"
                    >
                      <CheckIcon size={11} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel folder changes"
                    >
                      <XIcon size={11} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  {children.length > 0 ? (
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      tabIndex={-1}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${folder.name}`}
                      onClick={() => {
                        setExpanded((current) => {
                          const next = new Set(current)
                          if (next.has(folder.id)) next.delete(folder.id)
                          else next.add(folder.id)
                          return next
                        })
                      }}
                    >
                      {isExpanded ? (
                        <CaretDownIcon size={11} aria-hidden="true" />
                      ) : (
                        <CaretRightIcon size={11} aria-hidden="true" />
                      )}
                    </Button>
                  ) : (
                    <FolderIcon
                      size={11}
                      aria-hidden="true"
                      className="mx-1.5 shrink-0 text-[var(--color-text-muted)]"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-folder-tree-id={folder.id}
                    tabIndex={selected || (!selectedFolderIsVisible && rowIndex === 0) ? 0 : -1}
                    aria-label={`${folder.name}, ${itemCounts?.get(folder.id) ?? 0} items`}
                    onClick={() => onSelect(folder.id)}
                    onDoubleClick={() => startRename(folder)}
                    onKeyDown={(event) => handleKeyDown(event, folder)}
                    className={`min-w-0 flex-1 justify-start gap-1 px-1.5 ${
                      selected ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                    <span className="text-2xs text-[var(--color-text-muted)]">
                      {itemCounts?.get(folder.id) ?? 0}
                    </span>
                  </Button>
                  {movable && (
                    <Button
                      type="button"
                      variant="icon"
                      size="xs"
                      onClick={() => startRename(folder)}
                      aria-label={`Rename ${folder.name}`}
                      className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <PencilSimpleIcon size={11} aria-hidden="true" />
                    </Button>
                  )}
                  {movable && (
                    <span className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="icon"
                        size="xs"
                        onClick={() => void moveSibling(folder, -1)}
                        aria-label={`Move ${folder.name} up`}
                      >
                        <ArrowUpIcon size={10} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="icon"
                        size="xs"
                        onClick={() => void moveSibling(folder, 1)}
                        aria-label={`Move ${folder.name} down`}
                      >
                        <ArrowDownIcon size={10} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="icon"
                        size="xs"
                        onClick={() => void nestUnderPrevious(folder)}
                        aria-label={`Nest ${folder.name}`}
                      >
                        <ArrowRightIcon size={10} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="icon"
                        size="xs"
                        onClick={() => void moveOut(folder)}
                        aria-label={`Move ${folder.name} out`}
                      >
                        <ArrowLeftIcon size={10} aria-hidden="true" />
                      </Button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        Use arrow keys to navigate. Hold Alt with arrow keys to move folders.
      </p>
    </section>
  )
}
