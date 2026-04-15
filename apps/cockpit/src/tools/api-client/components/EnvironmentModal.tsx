import { useState } from 'react'
import { useApiStore } from '@/stores/api.store'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import { Input } from '@/components/shared/Input'
import { XIcon } from '@phosphor-icons/react'

type Props = {
  onClose: () => void
}

export function EnvironmentModal({ onClose }: Props) {
  const environments = useApiStore((s) => s.environments)
  const createEnvironment = useApiStore((s) => s.createEnvironment)
  const updateEnvironment = useApiStore((s) => s.updateEnvironment)
  const deleteEnvironment = useApiStore((s) => s.deleteEnvironment)
  const [selectedId, setSelectedId] = useState<string | null>(
    environments.length > 0 ? (environments[0]?.id ?? null) : null
  )

  const activeEnv = environments.find((e) => e.id === selectedId) || null

  const handleAdd = async () => {
    const env = await createEnvironment('New Environment', {})
    setSelectedId(env.id)
  }

  const handleRename = (name: string) => {
    if (!activeEnv) return
    updateEnvironment({ ...activeEnv, name })
  }

  const handleUpdateVar = (key: string, newKey: string, newValue: string) => {
    if (!activeEnv) return
    const variables = { ...activeEnv.variables }
    if (key !== newKey) {
      delete variables[key]
    }
    variables[newKey] = newValue
    updateEnvironment({ ...activeEnv, variables })
  }

  const handleDeleteVar = (key: string) => {
    if (!activeEnv) return
    const variables = { ...activeEnv.variables }
    delete variables[key]
    updateEnvironment({ ...activeEnv, variables })
  }

  const handleAddVar = () => {
    if (!activeEnv) return
    const variables = { ...activeEnv.variables }
    let base = 'newVar'
    let counter = 1
    while (variables[base]) {
      base = `newVar${counter++}`
    }
    variables[base] = ''
    updateEnvironment({ ...activeEnv, variables })
  }

  const handleDeleteEnv = () => {
    if (!activeEnv) return
    deleteEnvironment(activeEnv.id)
    setSelectedId(null)
  }

  return (
    <Dialog
      title="Manage Environments"
      onClose={onClose}
      closeLabel="Close environment manager"
      className="h-[80vh] w-[800px] max-w-[90vw]"
      bodyClassName="flex overflow-hidden p-0"
      titleClassName="text-lg"
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Env List */}
        <div className="w-1/3 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] flex overflow-hidden">
          <div className="p-2">
            <Button variant="secondary" size="sm" onClick={handleAdd} className="w-full mb-2">
              + Create Environment
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto w-full">
            {environments.map((env) => (
              <button
                key={env.id}
                onClick={() => setSelectedId(env.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  env.id === selectedId
                    ? 'bg-[var(--color-accent-dim)] font-bold text-[var(--color-accent)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {env.name}
              </button>
            ))}
            {environments.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                No environments yet.
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Editor */}
        <div className="flex-1 flex flex-col w-full overflow-hidden bg-[var(--color-bg)]">
          {activeEnv ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] p-4">
                <input
                  value={activeEnv.name}
                  onChange={(e) => handleRename(e.target.value)}
                  className="flex-1 border-b border-transparent bg-transparent px-1 py-0.5 text-lg font-bold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  placeholder="Environment Name"
                />
                <button
                  onClick={handleDeleteEnv}
                  className="rounded text-xs text-[var(--color-error)] hover:underline"
                >
                  Delete Environment
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-sm text-[var(--color-text)]">Variables</span>
                  <button
                    onClick={handleAddVar}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    + Add Variable
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {Object.entries(activeEnv.variables).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Input
                        value={key}
                        onChange={(e) => handleUpdateVar(key, e.target.value, value)}
                        placeholder="Variable name"
                        size="md"
                        className="w-1/3 font-mono"
                      />
                      <span className="text-[var(--color-text-muted)]">=</span>
                      <Input
                        value={value}
                        onChange={(e) => handleUpdateVar(key, key, e.target.value)}
                        placeholder="Value"
                        size="md"
                        className="flex-1 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteVar(key)}
                        aria-label={`Delete ${key} variable`}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                      >
                        <XIcon size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  {Object.keys(activeEnv.variables).length === 0 && (
                    <div className="text-center text-xs text-[var(--color-text-muted)] py-4">
                      No variables defined. Add one (e.g., baseUrl, token).
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
              Select or create an environment
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
