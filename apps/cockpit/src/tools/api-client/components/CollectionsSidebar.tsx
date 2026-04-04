import { useEffect, useRef, useState } from 'react'
import { useApiStore } from '@/stores/api.store'
import type { ApiCollection, ApiRequest } from '@/types/models'

type Props = {
  activeRequestId: string | null
  onSelect: (req: ApiRequest) => void
  onLoadFromHistory?: (method: string, url: string) => void
}

type ContextMenu = {
  reqId: string
  x: number
  y: number
}

type MoveMenu = {
  reqId: string
  x: number
  y: number
}

export function CollectionsSidebar({ activeRequestId, onSelect, onLoadFromHistory }: Props) {
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const requestHistory = useApiStore((s) => s.requestHistory)
  const createCollection = useApiStore((s) => s.createCollection)
  const updateCollection = useApiStore((s) => s.updateCollection)
  const deleteCollection = useApiStore((s) => s.deleteCollection)
  const createRequest = useApiStore((s) => s.createRequest)
  const updateRequest = useApiStore((s) => s.updateRequest)
  const deleteRequest = useApiStore((s) => s.deleteRequest)

  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState(false)

  // Inline collection rename state
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColName, setEditingColName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Request context menu
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [moveMenu, setMoveMenu] = useState<MoveMenu | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editingColId) renameInputRef.current?.focus()
  }, [editingColId])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu && !moveMenu) return
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
        setMoveMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu, moveMenu])

  const toggleCol = (id: string) => {
    setExpandedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateCollection = async () => {
    const col = await createCollection('New Collection')
    setExpandedCols((prev) => new Set(prev).add(col.id))
    // Immediately enter rename mode for the new collection
    setEditingColId(col.id)
    setEditingColName(col.name)
  }

  const startRename = (col: ApiCollection, e: React.MouseEvent) => {
    e.stopPropagation()
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

  const cancelRename = () => setEditingColId(null)

  const openContextMenu = (e: React.MouseEvent, reqId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setMoveMenu(null)
    setContextMenu({ reqId, x: e.clientX, y: e.clientY })
  }

  const handleDuplicate = async (reqId: string) => {
    setContextMenu(null)
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

  const handleMoveToCollection = (reqId: string) => {
    if (!contextMenu) return
    setMoveMenu({ reqId, x: contextMenu.x + 140, y: contextMenu.y })
    setContextMenu(null)
  }

  const handleAssignCollection = async (reqId: string, collectionId: string | null) => {
    setMoveMenu(null)
    const req = requests.find((r) => r.id === reqId)
    if (!req) return
    await updateRequest({ ...req, collectionId })
  }

  const handleDeleteRequest = async (reqId: string) => {
    setContextMenu(null)
    const req = requests.find((r) => r.id === reqId)
    if (req && confirm(`Delete "${req.name}"?`)) {
      await deleteRequest(reqId)
    }
  }

  const grouped = collections.map((col) => ({
    ...col,
    reqs: requests.filter((r) => r.collectionId === col.id),
  }))

  const unassigned = requests.filter((r) => !r.collectionId)

  return (
    <div className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] p-3">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Collections</span>
        <button
          onClick={handleCreateCollection}
          className="text-xs text-[var(--color-accent)] hover:underline"
          title="New Collection"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* Collections */}
        {grouped.map((col) => {
          const isExpanded = expandedCols.has(col.id)
          const isRenaming = editingColId === col.id
          return (
            <div key={col.id} className="mb-2">
              <div className="group flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-[var(--color-surface-hover)]">
                <div
                  className="flex flex-1 items-center gap-2 overflow-hidden"
                  onClick={() => !isRenaming && toggleCol(col.id)}
                >
                  <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      value={editingColName}
                      onChange={(e) => setEditingColName(e.target.value)}
                      onBlur={() => commitRename(col)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(col)
                        if (e.key === 'Escape') cancelRename()
                      }}
                      className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-1 py-0 text-sm font-bold text-[var(--color-text)] outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="truncate text-sm font-bold text-[var(--color-text)]"
                      onDoubleClick={(e) => startRename(col, e)}
                      title="Double-click to rename"
                    >
                      {col.name}
                    </span>
                  )}
                </div>
                {!isRenaming && (
                  <div className="hidden items-center gap-1 group-hover:flex">
                    <button
                      onClick={(e) => startRename(col, e)}
                      className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete collection "${col.name}"?`)) {
                          deleteCollection(col.id)
                        }
                      }}
                      className="text-[10px] text-[var(--color-error)] hover:underline"
                    >
                      Del
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && col.reqs.length > 0 && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-1">
                  {col.reqs.map((req) => (
                    <RequestRow
                      key={req.id}
                      req={req}
                      isActive={req.id === activeRequestId}
                      onSelect={() => onSelect(req)}
                      onContextMenu={(e) => openContextMenu(e, req.id)}
                    />
                  ))}
                </div>
              )}
              {isExpanded && col.reqs.length === 0 && (
                <div className="ml-5 mt-1 text-[10px] text-[var(--color-text-muted)] italic">
                  Empty collection
                </div>
              )}
            </div>
          )
        })}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Unassigned
            </div>
            <div className="flex flex-col gap-0.5">
              {unassigned.map((req) => (
                <RequestRow
                  key={req.id}
                  req={req}
                  isActive={req.id === activeRequestId}
                  onSelect={() => onSelect(req)}
                  onContextMenu={(e) => openContextMenu(e, req.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* History section */}
        {requestHistory.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <button
              className="mb-1 flex w-full items-center gap-1 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              onClick={() => setExpandedHistory((v) => !v)}
            >
              <span>{expandedHistory ? '▼' : '▶'}</span>
              <span>History</span>
              <span className="ml-auto normal-case">{requestHistory.length}</span>
            </button>
            {expandedHistory && (
              <div className="flex flex-col gap-0.5">
                {requestHistory.map((entry) => {
                  const [method, ...urlParts] = entry.input.split(' ')
                  const histUrl = urlParts.join(' ')
                  return (
                    <div
                      key={entry.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-[var(--color-surface-hover)]"
                      title={`${entry.input}\n${entry.output}\nClick to restore`}
                      onClick={() => onLoadFromHistory?.(method ?? 'GET', histUrl)}
                    >
                      <span
                        className={`shrink-0 text-[8px] font-bold ${getMethodColor(method ?? 'GET')}`}
                      >
                        {method}
                      </span>
                      <span className="flex-1 truncate text-[var(--color-text)]">{histUrl}</span>
                      <span className="shrink-0 text-[var(--color-text-muted)]">
                        {entry.output.split('·')[1]?.trim() ?? ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {(contextMenu || moveMenu) && (
        <div ref={contextMenuRef}>
          {contextMenu && (
            <div
              style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
              className="min-w-[140px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg"
            >
              <button
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleMoveToCollection(contextMenu.reqId)}
              >
                Move to Collection
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleDuplicate(contextMenu.reqId)}
              >
                Duplicate
              </button>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <button
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleDeleteRequest(contextMenu.reqId)}
              >
                Delete
              </button>
            </div>
          )}
          {moveMenu && (
            <div
              style={{ position: 'fixed', top: moveMenu.y, left: moveMenu.x, zIndex: 101 }}
              className="min-w-[160px] rounded border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg"
            >
              <button
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                onClick={() => handleAssignCollection(moveMenu.reqId, null)}
              >
                (Unassigned)
              </button>
              {collections.map((col) => (
                <button
                  key={col.id}
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  onClick={() => handleAssignCollection(moveMenu.reqId, col.id)}
                >
                  {col.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type RequestRowProps = {
  req: ApiRequest
  isActive: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function RequestRow({ req, isActive, onSelect, onContextMenu }: RequestRowProps) {
  return (
    <div
      className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
        isActive
          ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="truncate flex-1">{req.name}</span>
      <span className={`ml-2 shrink-0 text-[8px] font-bold ${getMethodColor(req.method)}`}>
        {req.method}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onContextMenu(e)
        }}
        className="ml-1 hidden shrink-0 text-[var(--color-text-muted)] group-hover:block hover:text-[var(--color-text)]"
        title="Options"
      >
        ⋮
      </button>
    </div>
  )
}

function getMethodColor(method: string) {
  switch (method) {
    case 'GET':
      return 'text-[var(--color-success)]'
    case 'POST':
      return 'text-[var(--color-warning)]'
    case 'PUT':
      return 'text-[var(--color-info)]'
    case 'PATCH':
      return 'text-[var(--color-accent)]'
    case 'DELETE':
      return 'text-[var(--color-error)]'
    default:
      return 'text-[var(--color-text-muted)]'
  }
}
