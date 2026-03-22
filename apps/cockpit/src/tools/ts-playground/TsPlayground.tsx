import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { TypeScriptWorker } from '@/workers/typescript.worker'
import TypeScriptWorkerFactory from '@/workers/typescript.worker?worker'

type TsPlaygroundState = {
  input: string
  target: string
  module: string
  strict: boolean
}

const EXAMPLE = `interface User {
  id: number
  name: string
  email: string
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`
}

const users: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
]

const greeting = users.map(greet)
console.log(greeting)
`

export default function TsPlayground() {
  useMonacoTheme()
  const [state, updateState] = useToolState<TsPlaygroundState>('ts-playground', {
    input: EXAMPLE,
    target: 'ESNext',
    module: 'ESNext',
    strict: true,
  })

  const worker = useWorker<TypeScriptWorker>(
    () => new TypeScriptWorkerFactory(),
    ['transpile']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [output, setOutput] = useState('')
  const [diagnostics, setDiagnostics] = useState<Array<{ message: string; line?: number }>>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTranspile = useCallback(async () => {
    if (!worker) return
    if (!state.input.trim()) {
      setOutput('')
      setDiagnostics([])
      return
    }
    try {
      const result = await worker.transpile(state.input, {
        target: state.target,
        module: state.module,
        strict: state.strict,
      })
      setOutput(result.output)
      setDiagnostics(result.diagnostics)
      if (result.diagnostics.length > 0) {
        setLastAction(`${result.diagnostics.length} diagnostic(s)`, 'info')
      }
    } catch (e) {
      setOutput(`// Error: ${(e as Error).message}`)
      setDiagnostics([])
    }
  }, [worker, state.input, state.target, state.module, state.strict, setLastAction])

  // Auto-transpile on input/option change (debounced 500ms)
  useEffect(() => {
    if (!worker) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void handleTranspile()
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [worker, state.input, state.target, state.module, state.strict, handleTranspile])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Target
          <select
            value={state.target}
            onChange={(e) => updateState({ target: e.target.value })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value="ES5">ES5</option>
            <option value="ES2015">ES2015</option>
            <option value="ES2020">ES2020</option>
            <option value="ESNext">ESNext</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Module
          <select
            value={state.module}
            onChange={(e) => updateState({ module: e.target.value })}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
          >
            <option value="ESNext">ESNext</option>
            <option value="CommonJS">CommonJS</option>
            <option value="None">None</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.strict}
            onChange={(e) => updateState({ strict: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          Strict
        </label>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={output} label="Copy Output" />
        </div>
      </div>
      {diagnostics.length > 0 && (
        <div className="max-h-20 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {diagnostics.map((d, i) => (
            <div key={i} className="text-xs text-[var(--color-warning)]">
              {d.line ? `Line ${d.line}: ` : ''}
              {d.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[var(--color-border)]">
          <Editor
            language="typescript"
            value={state.input}
            onChange={(v) => updateState({ input: v ?? '' })}
            options={EDITOR_OPTIONS}
          />
        </div>
        <div className="w-1/2">
          <Editor
            language="javascript"
            value={output}
            options={{ ...EDITOR_OPTIONS, readOnly: true }}
          />
        </div>
      </div>
    </div>
  )
}
