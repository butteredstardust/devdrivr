import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useApiStore } from '@/stores/api.store'
import type { ApiCollection, ApiRequest } from '@/types/models'
import {
  CaretDownIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TrayIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { httpMethodTextClass } from '@/lib/http-method'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Input } from '@/components/shared/Input'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from './ConfirmDialog'
import { SearchInput } from '@/components/shared/SearchInput'
import { MasterDetailLayout } from '@/components/shared/MasterDetailLayout'

type Props = {
  activeRequestId: string | null
  onSelect: (req: ApiRequest) => void
  onLoadFromHistory?: (method: string, url: string) => void
  onImport?: () => void
  onExport?: () => void
  /** Collapsed state. ApiClient's own toolbar owns the toggle, so no toggle is rendered here. */
  open?: boolean
  /** The request/response side. This component renders the shared master–detail shell because
   *  the sidebar heading's one action (new collection) needs sidebar-local state to work. */
  children: ReactNode
}

/** `root` lists the actions; `move` swaps the same popup over to collection targets. */
type MenuState = {
  reqId: string
  x: number
  y: number
  view: 'root' | 'move'
}

const MENU_WIDTH = 190
const MENU_MAX_HEIGHT = 260

function clampToViewport(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(8, window.innerWidth - MENU_WIDTH - 8)
  const maxY = Math.max(8, window.innerHeight - MENU_MAX_HEIGHT - 8)
  return { x: Math.min(x, maxX), y: Math.min(y, maxY) }
}

function matchesQuery(request: ApiRequest, needle: string): boolean {
  return (
    request.name.toLowerCase().includes(needle) ||
    request.url.toLowerCase().includes(needle) ||
    request.method.toLowerCase().includes(needle)
  )
}

export function CollectionsSidebar({
  activeRequestId,
  onSelect,
  onLoadFromHistory,
  onImport,
  onExport,
  open = true,
  children,
}: Props) {
  const requestRowsId = useId()
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const requestHistory = useApiStore((s) => s.requestHistory)
  const createCollection = useApiStore((s) => s.createCollection)
  const updateCollection = useApiStore((s) => s.updateCollection)
  const deleteCollection = useApiStore((s) => s.deleteCollection)
  const createRequest = useApiStore((s) => s.createRequest)
  const updateRequest = useApiStore((s) => s.updateRequest)
  const deleteRequest = useApiStore((s) => s.deleteRequest)

  const [search, setSearch] = useState('')
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState(false)

  // Inline collection rename state
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColName, setEditingColName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTriggerRef = useRef<HTMLElement | null>(null)

  const [pendingRequestDelete, setPendingRequestDelete] = useState<ApiRequest | null>(null)
  const [pendingCollectionDelete, setPendingCollectionDelete] = useState<ApiCollection | null>(null)

  const needle = search.trim().toLowerCase()

  const grouped = useMemo(() => {
    return collections
      .map((col) => {
        const all = requests.filter((r) => r.collectionId === col.id)
        const matched = needle ? all.filter((r) => matchesQuery(r, needle)) : all
        const collectionMatches = needle ? col.name.toLowerCase().includes(needle) : true
        return {
          col,
          reqs: collectionMatches && matched.length === 0 ? all : matched,
          total: all.length,
        }
      })
      .filter(
        ({ col, reqs }) => !needle || reqs.length > 0 || col.name.toLowerCase().includes(needle)
      )
  }, [collections, requests, needle])

  const unassigned = useMemo(() => {
    const all = requests.filter((r) => !r.collectionId)
    return needle ? all.filter((r) => matchesQuery(r, needle)) : all
  }, [requests, needle])

  // Flattened list of the request rows the user can actually see, in visual
  // order — the roving arrow-key navigation walks this, not the raw store list.
  const visibleRequestIds = useMemo(() => {
    const ids: string[] = []
    for (const { col, reqs } of grouped) {
      if (needle || !collapsedCols.has(col.id)) ids.push(...reqs.map((r) => r.id))
    }
    ids.push(...unassigned.map((r) => r.id))
    return ids
  }, [grouped, unassigned, collapsedCols, needle])

  useEffect(() => {
    if (editingColId) renameInputRef.current?.focus()
  }, [editingColId])

  // Close the menu on an outside press
  useEffect(() => {
    if (!menu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menu])

  // Move focus into the menu when it opens so it is operable from the keyboard.
  useEffect(() => {
    if (!menu) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
  }, [menu])

  const closeMenu = useCallback((restoreFocus = true) => {
    setMenu(null)
    if (restoreFocus && menuTriggerRef.current?.isConnected) menuTriggerRef.current.focus()
  }, [])

  const toggleCol = (id: string) => {
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateCollection = async () => {
    const col = await createCollection('New Collection')
    setCollapsedCols((prev) => {
      const next = new Set(prev)
      next.delete(col.id)
      return next
    })
    // Immediately enter rename mode for the new collection
    setEditingColId(col.id)
    setEditingColName(col.name)
  }

  const startRename = (col: ApiCollection) => {
    setEditingColId(col.id)
    setEditingColName(col.name)
  }

  const commitRename = async (col: ApiCollection) => {
    const trimmed = editingColName.trim()
    if (trimmed && trimmed !== col.name) {
      await updateCollection({ ...col, name: trimmed })
    }
    setEditingColId(null)
  }

  const openMenu = (trigger: HTMLElement, reqId: string, x: number, y: number) => {
    menuTriggerRef.current = trigger
    setMenu({ reqId, view: 'root', ...clampToViewport(x, y) })
  }

  const handleDuplicate = async (reqId: string) => {
    closeMenu()
    const req = requests.find((r) => r.id === reqId)
    if (!req) return
    await createRequest({
      name: `Copy of ${req.name}`,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      bodyMode: req.bodyMode,
      auth: req.auth,
      collectionId: req.collectionId,
    })
  }

  const handleAssignCollection = async (reqId: string, collectionId: string | null) => {
    closeMenu()
    const req = requests.find((r) => r.id === reqId)
    if (!req) return
    await updateRequest({ ...req, collectionId })
  }

  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return
    }
    if (e.key === 'Tab') {
      closeMenu()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1
    items[(next + items.length) % items.length]?.focus()
  }

  const handleRowKeyDown = (e: KeyboardEvent<HTMLElement>, reqId: string) => {
    const index = visibleRequestIds.indexOf(reqId)
    if (index < 0) return
    let nextIndex: number | null = null
    if (e.key === 'ArrowDown') nextIndex = Math.min(visibleRequestIds.length - 1, index + 1)
    if (e.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
    if (e.key === 'Home') nextIndex = 0
    if (e.key === 'End') nextIndex = visibleRequestIds.length - 1

    if (nextIndex !== null) {
      if (nextIndex === index) return
      e.preventDefault()
      document.getElementById(`${requestRowsId}-request-${visibleRequestIds[nextIndex]}`)?.focus()
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const req = requests.find((r) => r.id === reqId)
      if (!req) return
      e.preventDefault()
      setPendingRequestDelete(req)
    }
  }

  const menuRequest = menu ? requests.find((r) => r.id === menu.reqId) : undefined
  const totalMatches = grouped.reduce((sum, g) => sum + g.reqs.length, 0) + unassigned.length

  return (
    <>
      <MasterDetailLayout
        title="Requests"
        subtitle={`${requests.length} saved · ${collections.length} collections`}
        sidebarOpen={open}
        sidebarActions={
          <Button
            type="button"
            variant="icon"
            size="sm"
            onClick={() => void handleCreateCollection()}
            title="New collection"
            aria-label="New collection"
          >
            <FolderPlusIcon size={16} aria-hidden="true" />
          </Button>
        }
        sidebar={
          <>
            <div className="border-b border-[var(--color-border)] p-2">
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search requests"
                aria-label="Search saved requests"
                clearLabel="Clear request search"
              />
              {needle && (
                <p className="mt-1.5 text-2xs text-[var(--color-text-muted)]" aria-live="polite">
                  {totalMatches} matching {totalMatches === 1 ? 'request' : 'requests'}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {grouped.map(({ col, reqs, total }) => {
                const isExpanded = !!needle || !collapsedCols.has(col.id)
                const isRenaming = editingColId === col.id
                return (
                  <div key={col.id} className="mb-2">
                    <div className="group flex items-center gap-1 rounded px-1 hover:bg-[var(--color-surface-hover)]">
                      {isRenaming ? (
                        <Input
                          ref={renameInputRef}
                          value={editingColName}
                          onChange={(e) => setEditingColName(e.target.value)}
                          onBlur={() => void commitRename(col)}
                          aria-label={`Rename collection ${col.name}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(col)
                            if (e.key === 'Escape') setEditingColId(null)
                          }}
                          // Boxed rather than inline: the border is what tells you the
                          // row has flipped into edit mode. The accent colour comes from
                          // Input's own `focus:` border — the field is autofocused on entering
                          // rename mode and commits on blur, so it is focused for its whole
                          // life. Restating the accent as a plain class here would do nothing:
                          // it ties with Input's resting border on specificity and loses on
                          // stylesheet order.
                          className="my-1 min-w-0 flex-1 font-bold"
                        />
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => toggleCol(col.id)}
                            aria-expanded={isExpanded}
                            className="min-w-0 flex-1 justify-start gap-1.5 py-1.5 text-left"
                          >
                            {isExpanded ? (
                              <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
                            ) : (
                              <CaretRightIcon size={12} weight="bold" aria-hidden="true" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--color-text)]">
                              {col.name}
                            </span>
                            <span className="shrink-0 text-2xs text-[var(--color-text-muted)]">
                              {total}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            variant="icon"
                            size="xs"
                            onClick={() => startRename(col)}
                            title={`Rename ${col.name}`}
                            aria-label={`Rename collection ${col.name}`}
                            className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <PencilSimpleIcon size={12} aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="icon"
                            size="xs"
                            onClick={() => setPendingCollectionDelete(col)}
                            title={`Delete ${col.name}`}
                            aria-label={`Delete collection ${col.name}`}
                            className="opacity-0 hover:text-[var(--color-error)] focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <XIcon size={12} aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-1">
                        {reqs.map((req) => (
                          <RequestRow
                            key={req.id}
                            req={req}
                            rowId={`${requestRowsId}-request-${req.id}`}
                            isActive={req.id === activeRequestId}
                            tabIndex={
                              visibleRequestIds[0] === req.id || req.id === activeRequestId ? 0 : -1
                            }
                            onSelect={() => onSelect(req)}
                            onOpenMenu={openMenu}
                            onKeyDown={handleRowKeyDown}
                          />
                        ))}
                        {reqs.length === 0 && (
                          <p className="px-2 py-1 text-2xs italic text-[var(--color-text-muted)]">
                            Empty collection
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {unassigned.length > 0 && (
                <div className="mt-3">
                  <SectionLabel as="h3" className="mb-1 px-2">
                    Unassigned
                  </SectionLabel>
                  <div className="flex flex-col gap-0.5">
                    {unassigned.map((req) => (
                      <RequestRow
                        key={req.id}
                        req={req}
                        rowId={`${requestRowsId}-request-${req.id}`}
                        isActive={req.id === activeRequestId}
                        tabIndex={
                          visibleRequestIds[0] === req.id || req.id === activeRequestId ? 0 : -1
                        }
                        onSelect={() => onSelect(req)}
                        onOpenMenu={openMenu}
                        onKeyDown={handleRowKeyDown}
                      />
                    ))}
                  </div>
                </div>
              )}

              {requests.length === 0 && (
                <EmptyState
                  icon={TrayIcon}
                  size="sm"
                  title="No saved requests"
                  description="Send a request, then Save it to build up a collection."
                />
              )}

              {requests.length > 0 && totalMatches === 0 && (
                <EmptyState
                  icon={MagnifyingGlassIcon}
                  size="sm"
                  title="No matches"
                  description="Try a different search term."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSearch('')}
                    >
                      Clear search
                    </Button>
                  }
                />
              )}

              {requestHistory.length > 0 && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-expanded={expandedHistory}
                    className="w-full justify-start gap-1.5 px-2 text-2xs font-bold uppercase tracking-wider"
                    onClick={() => setExpandedHistory((v) => !v)}
                  >
                    {expandedHistory ? (
                      <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
                    ) : (
                      <CaretRightIcon size={12} weight="bold" aria-hidden="true" />
                    )}
                    <ClockCounterClockwiseIcon size={12} aria-hidden="true" />
                    <span>History</span>
                    <span className="ml-auto normal-case">{requestHistory.length}</span>
                  </Button>
                  {expandedHistory && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {requestHistory.map((entry) => {
                        const [method, ...urlParts] = entry.input.split(' ')
                        const histUrl = urlParts.join(' ')
                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            key={entry.id}
                            className="w-full justify-start gap-1.5 text-left hover:bg-[var(--color-surface-hover)]"
                            title={`${entry.input}\n${entry.output}\nClick to restore`}
                            aria-label={`Restore ${entry.input}`}
                            onClick={() => onLoadFromHistory?.(method ?? 'GET', histUrl)}
                          >
                            <span
                              className={`shrink-0 text-2xs font-bold ${httpMethodTextClass(method ?? 'GET')}`}
                            >
                              {method}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">
                              {histUrl}
                            </span>
                            <span className="shrink-0 text-[var(--color-text-muted)]">
                              {entry.output.split('·')[1]?.trim() ?? ''}
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-2 py-1.5">
              <span className="text-2xs text-[var(--color-text-muted)]">Library</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={onImport}
                  title="Import requests from Postman, OpenAPI, AsyncAPI, protobuf, GraphQL, or JSON"
                  aria-label="Import requests"
                >
                  <UploadSimpleIcon size={14} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="xs"
                  onClick={onExport}
                  title="Copy all saved requests to the clipboard as JSON"
                  aria-label="Export requests"
                  disabled={requests.length === 0}
                >
                  <DownloadSimpleIcon size={14} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        }
      >
        {children}
      </MasterDetailLayout>

      {/* Overlays sit outside the layout: the sidebar collapses to `w-0 overflow-hidden`, which
          would clip a `position: fixed` menu rendered inside it. */}
      {menu && menuRequest && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${menuRequest.name}`}
          onKeyDown={handleMenuKeyDown}
          style={{
            position: 'fixed',
            top: menu.y,
            left: menu.x,
            width: MENU_WIDTH,
            maxHeight: MENU_MAX_HEIGHT,
            zIndex: 'var(--z-popover)',
          }}
          className="overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg"
        >
          {menu.view === 'root' ? (
            <>
              <MenuItem onClick={() => setMenu({ ...menu, view: 'move' })}>
                Move to collection…
              </MenuItem>
              <MenuItem onClick={() => void handleDuplicate(menu.reqId)}>Duplicate</MenuItem>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <MenuItem
                tone="danger"
                onClick={() => {
                  // closeMenu (not setMenu(null)) so focus returns to the row's
                  // trigger — that is what the confirm dialog restores to on cancel.
                  closeMenu()
                  setPendingRequestDelete(menuRequest)
                }}
              >
                Delete…
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem onClick={() => void handleAssignCollection(menu.reqId, null)}>
                (Unassigned)
              </MenuItem>
              {collections.map((col) => (
                <MenuItem
                  key={col.id}
                  onClick={() => void handleAssignCollection(menu.reqId, col.id)}
                >
                  {col.name}
                </MenuItem>
              ))}
              {collections.length === 0 && (
                <p className="px-3 py-2 text-2xs text-[var(--color-text-muted)]">
                  No collections yet.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {pendingRequestDelete && (
        <ConfirmDialog
          title="Delete request"
          confirmLabel="Delete request"
          onClose={() => setPendingRequestDelete(null)}
          onConfirm={() => {
            const id = pendingRequestDelete.id
            setPendingRequestDelete(null)
            void deleteRequest(id)
          }}
        >
          <p>
            Delete <strong>{pendingRequestDelete.name}</strong>? This cannot be undone.
          </p>
        </ConfirmDialog>
      )}

      {pendingCollectionDelete && (
        <ConfirmDialog
          title="Delete collection"
          confirmLabel="Delete collection"
          onClose={() => setPendingCollectionDelete(null)}
          onConfirm={() => {
            const id = pendingCollectionDelete.id
            setPendingCollectionDelete(null)
            void deleteCollection(id)
          }}
        >
          <p>
            Delete <strong>{pendingCollectionDelete.name}</strong>?
          </p>
          {(() => {
            const count = requests.filter(
              (r) => r.collectionId === pendingCollectionDelete.id
            ).length
            return (
              <p className="mt-2 text-[var(--color-warning)]">
                {count === 0
                  ? 'The collection is empty.'
                  : `${count} saved ${count === 1 ? 'request' : 'requests'} inside it will also be deleted.`}
              </p>
            )
          })()}
        </ConfirmDialog>
      )}
    </>
  )
}

type MenuItemProps = {
  children: React.ReactNode
  onClick: () => void
  tone?: 'danger' | 'default'
}

function MenuItem({ children, onClick, tone = 'default' }: MenuItemProps) {
  return (
    <Button
      type="button"
      role="menuitem"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`w-full justify-start rounded-none px-3 text-left ${
        tone === 'danger' ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
    </Button>
  )
}

type RequestRowProps = {
  req: ApiRequest
  rowId: string
  isActive: boolean
  tabIndex: number
  onSelect: () => void
  onOpenMenu: (trigger: HTMLElement, reqId: string, x: number, y: number) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>, reqId: string) => void
}

function RequestRow({
  req,
  rowId,
  isActive,
  tabIndex,
  onSelect,
  onOpenMenu,
  onKeyDown,
}: RequestRowProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      className={`group flex items-center rounded text-xs ${
        isActive
          ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
      }`}
      onContextMenu={(e) => {
        e.preventDefault()
        onOpenMenu(menuButtonRef.current ?? e.currentTarget, req.id, e.clientX, e.clientY)
      }}
    >
      <Button
        id={rowId}
        type="button"
        variant="ghost"
        size="sm"
        tabIndex={tabIndex}
        className="min-w-0 flex-1 justify-between gap-2 text-left hover:bg-transparent"
        onClick={onSelect}
        onKeyDown={(e) => onKeyDown(e, req.id)}
        aria-label={req.name}
        aria-current={isActive ? 'true' : undefined}
        title={`${req.method} ${req.url}`}
      >
        <span className="min-w-0 flex-1 truncate">{req.name}</span>
        <span className={`shrink-0 text-2xs font-bold ${httpMethodTextClass(req.method)}`}>
          {req.method}
        </span>
      </Button>
      <Button
        ref={menuButtonRef}
        type="button"
        variant="icon"
        size="xs"
        tabIndex={tabIndex}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          onOpenMenu(e.currentTarget, req.id, rect.left, rect.bottom + 2)
        }}
        onKeyDown={(e) => onKeyDown(e, req.id)}
        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        title={`Actions for ${req.name}`}
        aria-label={`Actions for ${req.name}`}
        aria-haspopup="menu"
      >
        <DotsThreeVerticalIcon size={14} weight="bold" aria-hidden="true" />
      </Button>
    </div>
  )
}
