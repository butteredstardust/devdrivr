import { useCallback, useState } from 'react'
import { CopyButton } from '@/components/shared/CopyButton'
import { useToolState } from '@/hooks/useToolState'
import { useUiStore } from '@/stores/ui.store'

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function generateUuid(): string {
  return crypto.randomUUID()
}

type UuidState = {
  lastGenerated: string
  bulkCount: number
  validateInput: string
}

export default function UuidGenerator() {
  const [state, updateState] = useToolState<UuidState>('uuid-generator', {
    lastGenerated: '',
    bulkCount: 10,
    validateInput: '',
  })

  const [bulkUuids, setBulkUuids] = useState<string[]>([])
  const setLastAction = useUiStore((s) => s.setLastAction)

  const generate = useCallback(() => {
    const uuid = generateUuid()
    updateState({ lastGenerated: uuid })
    setLastAction('Generated UUID', 'success')
  }, [updateState, setLastAction])

  const generateBulk = useCallback(() => {
    const count = Math.min(Math.max(1, state.bulkCount), 100)
    const uuids = Array.from({ length: count }, () => generateUuid())
    setBulkUuids(uuids)
    setLastAction(`Generated ${count} UUIDs`, 'success')
  }, [state.bulkCount, setLastAction])

  const validateResult = state.validateInput.trim()
    ? UUID_V4_REGEX.test(state.validateInput.trim())
      ? { valid: true, message: '✓ Valid UUID v4' }
      : { valid: false, message: '✗ Not a valid UUID v4' }
    : null

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Generate</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={generate}
            className="rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Generate UUID
          </button>
          {state.lastGenerated && (
            <div className="flex items-center gap-2">
              <code className="rounded bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
                {state.lastGenerated}
              </code>
              <CopyButton text={state.lastGenerated} />
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Bulk Generate</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={100}
            value={state.bulkCount}
            onChange={(e) => updateState({ bulkCount: parseInt(e.target.value) || 1 })}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={generateBulk}
            className="rounded border border-[var(--color-accent)] px-4 py-2 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Generate
          </button>
          {bulkUuids.length > 0 && (
            <CopyButton text={bulkUuids.join('\n')} label="Copy All" />
          )}
        </div>
        {bulkUuids.length > 0 && (
          <pre className="max-h-60 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]">
            {bulkUuids.join('\n')}
          </pre>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Validate</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={state.validateInput}
            onChange={(e) => updateState({ validateInput: e.target.value })}
            placeholder="Paste a UUID to validate..."
            className="w-96 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
          />
          {validateResult && (
            <span
              className={`text-sm ${
                validateResult.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
              }`}
            >
              {validateResult.message}
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
