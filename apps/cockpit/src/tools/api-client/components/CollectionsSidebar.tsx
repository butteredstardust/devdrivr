import { useState } from 'react'
import { useApiStore } from '@/stores/api.store'
import type { ApiRequest } from '@/types/models'

type Props = {
  activeRequestId: string | null
  onSelect: (req: ApiRequest) => void
}

export function CollectionsSidebar({ activeRequestId, onSelect }: Props) {
  const collections = useApiStore((s) => s.collections)
  const requests = useApiStore((s) => s.requests)
  const createCollection = useApiStore((s) => s.createCollection)
  const deleteCollection = useApiStore((s) => s.deleteCollection)
  const deleteRequest = useApiStore((s) => s.deleteRequest)
  
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set())

  const toggleCol = (id: string) => {
    setExpandedCols((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateCollection = async () => {
    const name = prompt('Collection Name:')
    if (name) {
      const col = await createCollection(name)
      setExpandedCols((prev) => new Set(prev).add(col.id))
    }
  }

  const grouped = collections.map((col) => ({
    ...col,
    reqs: requests.filter((r) => r.collectionId === col.id),
  }))

  const unassigned = requests.filter((r) => !r.collectionId)

  return (
    <div className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
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
        {grouped.map((col) => {
          const isExpanded = expandedCols.has(col.id)
          return (
            <div key={col.id} className="mb-2">
              <div
                className="group flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-[var(--color-surface-hover)]"
              >
                <div 
                  className="flex flex-1 items-center gap-2 overflow-hidden"
                  onClick={() => toggleCol(col.id)}
                >
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="truncate text-sm font-bold text-[var(--color-text)]">
                    {col.name}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete collection "${col.name}"?`)) {
                      deleteCollection(col.id)
                    }
                  }}
                  className="hidden text-[10px] text-[var(--color-error)] group-hover:block hover:underline"
                >
                  Del
                </button>
              </div>

              {isExpanded && col.reqs.length > 0 && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-1">
                  {col.reqs.map((req) => (
                    <div
                      key={req.id}
                      className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
                        req.id === activeRequestId
                          ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                      }`}
                      onClick={() => onSelect(req)}
                    >
                      <span className="truncate flex-1">{req.name}</span>
                      <span className={`ml-2 text-[8px] font-bold ${getMethodColor(req.method)}`}>
                        {req.method}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete request "${req.name}"?`)) {
                            deleteRequest(req.id)
                          }
                        }}
                        className="ml-2 hidden text-[10px] text-[var(--color-error)] group-hover:block"
                        title="Delete Request"
                      >
                        ✕
                      </button>
                    </div>
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

        {unassigned.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Unassigned
            </div>
            <div className="flex flex-col gap-0.5">
              {unassigned.map((req) => (
                <div
                  key={req.id}
                  className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
                    req.id === activeRequestId
                      ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                  }`}
                  onClick={() => onSelect(req)}
                >
                  <span className="truncate flex-1">{req.name}</span>
                  <span className={`ml-2 text-[8px] font-bold ${getMethodColor(req.method)}`}>
                    {req.method}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete request "${req.name}"?`)) {
                        deleteRequest(req.id)
                      }
                    }}
                    className="ml-2 hidden text-[10px] text-[var(--color-error)] group-hover:block"
                    title="Delete Request"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function getMethodColor(method: string) {
  switch (method) {
    case 'GET': return 'text-[var(--color-success)]'
    case 'POST': return 'text-[var(--color-warning)]'
    case 'PUT': return 'text-[var(--color-info)]'
    case 'PATCH': return 'text-[var(--color-accent)]'
    case 'DELETE': return 'text-[var(--color-error)]'
    default: return 'text-[var(--color-text-muted)]'
  }
}
