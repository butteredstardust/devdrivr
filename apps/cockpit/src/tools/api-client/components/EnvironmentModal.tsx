import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApiStore } from '@/stores/api.store'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { Input } from '@/components/shared/Input'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from './ConfirmDialog'
import { PlusIcon, StackIcon, TrashIcon, XIcon } from '@phosphor-icons/react'

type Props = {
  onClose: () => void
}

/**
 * Variables are stored as a plain object, but an object cannot express "a row
 * the user is midway through renaming". Editing rows by their key meant every
 * keystroke deleted and re-added the entry, remounting the input and losing
 * focus. Rows carry a synthetic id instead, and the object is derived on write.
 */
type VarRow = { id: string; key: string; value: string }

let rowIdCounter = 0
const nextRowId = () => `var-${++rowIdCounter}`

function toRows(variables: Record<string, string>): VarRow[] {
  return Object.entries(variables).map(([key, value]) => ({ id: nextRowId(), key, value }))
}

/** Later rows win on a duplicate key, matching how the object would collapse. */
function toVariables(rows: VarRow[]): Record<string, string> {
  const variables: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key) variables[key] = row.value
  }
  return variables
}

export function EnvironmentModal({ onClose }: Props) {
  const environments = useApiStore((s) => s.environments)
  const createEnvironment = useApiStore((s) => s.createEnvironment)
  const updateEnvironment = useApiStore((s) => s.updateEnvironment)
  const deleteEnvironment = useApiStore((s) => s.deleteEnvironment)

  const [selectedId, setSelectedId] = useState<string | null>(environments[0]?.id ?? null)
  const [rows, setRows] = useState<VarRow[]>(() => toRows(environments[0]?.variables ?? {}))
  // The name is edited locally for the same reason as the rows: `updateEnvironment`
  // awaits the SQLite write before publishing, so binding the input straight to
  // store state makes fast typing lag and drop characters.
  const [nameDraft, setNameDraft] = useState(environments[0]?.name ?? '')
  const [confirmDeleteEnv, setConfirmDeleteEnv] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastLoadedId = useRef<string | null>(environments[0]?.id ?? null)
  const newVarRef = useRef<HTMLInputElement>(null)
  const focusNewVar = useRef(false)

  const activeEnv = environments.find((e) => e.id === selectedId) ?? null

  // Reload rows only when the selected environment changes — never on every
  // store update, or in-progress edits would be clobbered mid-keystroke.
  useEffect(() => {
    if (lastLoadedId.current === selectedId) return
    lastLoadedId.current = selectedId
    const next = environments.find((e) => e.id === selectedId)
    setRows(toRows(next?.variables ?? {}))
    setNameDraft(next?.name ?? '')
  }, [environments, selectedId])

  useEffect(() => {
    if (focusNewVar.current && newVarRef.current) {
      focusNewVar.current = false
      newVarRef.current.focus()
    }
  }, [rows])

  const persist = useCallback(
    (patch: { name?: string; rows?: VarRow[] }) => {
      if (!activeEnv) return
      const nextRows = patch.rows ?? rows
      void updateEnvironment({
        ...activeEnv,
        name: patch.name ?? nameDraft,
        variables: toVariables(nextRows),
      }).catch((e: unknown) => {
        setError(`Could not save environment — ${(e as Error).message}`)
      })
    },
    [activeEnv, nameDraft, rows, updateEnvironment]
  )

  const handleAdd = useCallback(async () => {
    try {
      const env = await createEnvironment('New Environment', {})
      setSelectedId(env.id)
    } catch (e) {
      setError(`Could not create environment — ${(e as Error).message}`)
    }
  }, [createEnvironment])

  const updateRow = useCallback(
    (id: string, patch: Partial<VarRow>) => {
      const nextRows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
      setRows(nextRows)
      persist({ rows: nextRows })
    },
    [persist, rows]
  )

  const removeRow = useCallback(
    (id: string) => {
      const nextRows = rows.filter((row) => row.id !== id)
      setRows(nextRows)
      persist({ rows: nextRows })
    },
    [persist, rows]
  )

  const addRow = useCallback(() => {
    focusNewVar.current = true
    setRows((current) => [...current, { id: nextRowId(), key: '', value: '' }])
  }, [])

  const handleDeleteEnv = useCallback(() => {
    if (!activeEnv) return
    setConfirmDeleteEnv(false)
    void deleteEnvironment(activeEnv.id).catch((e: unknown) => {
      setError(`Could not delete environment — ${(e as Error).message}`)
    })
    setSelectedId(null)
  }, [activeEnv, deleteEnvironment])

  // Trimmed keys that appear more than once — the earlier row silently loses.
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const row of rows) {
      const key = row.key.trim()
      if (!key) continue
      if (seen.has(key)) dupes.add(key)
      seen.add(key)
    }
    return dupes
  }, [rows])

  return (
    <Dialog
      title="Manage Environments"
      onClose={onClose}
      closeLabel="Close environment manager"
      className="h-[80vh] max-h-[calc(100vh-3rem)] w-[50rem] max-w-[calc(100vw-2rem)]"
      bodyClassName="flex overflow-hidden p-0"
      titleClassName="text-lg"
    >
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)] max-[720px]:grid-cols-[8rem_minmax(0,1fr)]">
        {/* Environment list */}
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="p-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleAdd()}
              className="w-full gap-1"
            >
              <PlusIcon size={12} aria-hidden="true" />
              New Environment
            </Button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-label="Environments">
            {environments.map((env) => (
              <li key={env.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedId(env.id)}
                  aria-current={env.id === selectedId}
                  className={`w-full justify-start truncate text-left ${
                    env.id === selectedId
                      ? 'bg-[var(--color-accent-dim)] font-bold text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]'
                      : 'hover:bg-[var(--color-surface-hover)]'
                  }`}
                >
                  <span className="truncate">{env.name}</span>
                </Button>
              </li>
            ))}
          </ul>
          {environments.length === 0 && (
            <p className="px-3 pb-3 text-center text-xs text-[var(--color-text-muted)]">
              No environments yet.
            </p>
          )}
        </div>

        {/* Editor */}
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--color-bg)]">
          {activeEnv ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
                <input
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value)
                    persist({ name: e.target.value })
                  }}
                  aria-label="Environment name"
                  placeholder="Environment name"
                  className="min-w-0 flex-1 basis-40 border-b border-transparent bg-transparent px-1 py-0.5 text-base font-bold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmDeleteEnv(true)}
                  className="gap-1 text-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                >
                  <TrashIcon size={13} aria-hidden="true" />
                  Delete
                </Button>
              </div>

              {error && (
                <p
                  role="alert"
                  className="border-b border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-error)]"
                >
                  {error}
                </p>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-mono text-xs text-[var(--color-text-muted)]">
                    Variables — use as <code>{'{{name}}'}</code>
                  </h3>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={addRow}
                    className="gap-1"
                  >
                    <PlusIcon size={10} aria-hidden="true" />
                    Add
                  </Button>
                </div>

                {rows.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {rows.map((row, index) => {
                      const duplicate = duplicateKeys.has(row.key.trim())
                      return (
                        <div key={row.id} className="flex flex-wrap items-center gap-1.5">
                          <Input
                            ref={index === rows.length - 1 ? newVarRef : undefined}
                            value={row.key}
                            onChange={(e) => updateRow(row.id, { key: e.target.value })}
                            placeholder="Variable name"
                            aria-label={`Variable ${index + 1} name`}
                            aria-invalid={duplicate}
                            size="md"
                            className={`w-1/3 min-w-24 font-mono ${
                              duplicate ? 'border-[var(--color-error)]' : ''
                            }`}
                          />
                          <span aria-hidden="true" className="text-[var(--color-text-muted)]">
                            =
                          </span>
                          <Input
                            value={row.value}
                            onChange={(e) => updateRow(row.id, { value: e.target.value })}
                            placeholder="Value"
                            aria-label={`Variable ${index + 1} value`}
                            size="md"
                            className="min-w-24 flex-1 font-mono"
                          />
                          <Button
                            type="button"
                            variant="icon"
                            size="sm"
                            onClick={() => removeRow(row.id)}
                            aria-label={`Delete ${row.key.trim() || `variable ${index + 1}`}`}
                            className="hover:text-[var(--color-error)]"
                          >
                            <XIcon size={15} aria-hidden="true" />
                          </Button>
                        </div>
                      )
                    })}
                    {duplicateKeys.size > 0 && (
                      <p role="alert" className="mt-1 text-2xs text-[var(--color-error)]">
                        Duplicate name{duplicateKeys.size > 1 ? 's' : ''}:{' '}
                        {[...duplicateKeys].join(', ')} — only the last row is used.
                      </p>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={StackIcon}
                    size="sm"
                    title="No variables yet"
                    description="Add baseUrl or token, then reference it as {{baseUrl}} in any request."
                    action={
                      <Button type="button" variant="secondary" size="xs" onClick={addRow}>
                        Add variable
                      </Button>
                    }
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <EmptyState
                icon={StackIcon}
                title="No environment selected"
                description="Select an environment on the left, or create one to hold shared variables."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleAdd()}
                  >
                    New environment
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>

      {confirmDeleteEnv && activeEnv && (
        <ConfirmDialog
          title="Delete environment?"
          confirmLabel="Delete environment"
          onClose={() => setConfirmDeleteEnv(false)}
          onConfirm={handleDeleteEnv}
        >
          <p>
            “{nameDraft || activeEnv.name}” and its {Object.keys(activeEnv.variables).length}{' '}
            variable
            {Object.keys(activeEnv.variables).length === 1 ? '' : 's'} will be deleted. Requests
            using those <code>{'{{variables}}'}</code> will send them unresolved.
          </p>
        </ConfirmDialog>
      )}
    </Dialog>
  )
}
