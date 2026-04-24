import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/shared/Button'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import type { FormatterWorker } from '@/workers/formatter.worker'
import FormatterWorkerFactory from '@/workers/formatter.worker?worker'
import {
  parseYaml,
  stringifyYaml,
  sortKeysDeep,
  yamlToJson,
  jsonToYaml,
} from '@/tools/yaml-tools/yaml-helpers'

type YamlToolsState = {
  input: string
  activeTab: string
  jsonInput: string
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'convert', label: 'JSON ↔ YAML' },
]

function yamlStats(data: unknown): { keys: number; depth: number; size: string } {
  let keyCount = 0
  let maxDepth = 0
  const MAX_DEPTH = 1000 // Prevent stack overflow

  function walk(val: unknown, depth: number) {
    if (depth > MAX_DEPTH) return // Safety limit
    if (depth > maxDepth) maxDepth = depth
    if (Array.isArray(val)) {
      for (const item of val) walk(item, depth + 1)
    } else if (val !== null && typeof val === 'object') {
      try {
        const entries = Object.entries(val as Record<string, unknown>)
        keyCount += entries.length
        for (const [, v] of entries) walk(v, depth + 1)
      } catch {
        // Skip invalid objects
      }
    }
  }

  try {
    walk(data, 0)
    const bytes = new Blob([JSON.stringify(data)]).size
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
    return { keys: keyCount, depth: maxDepth, size }
  } catch {
    return { keys: 0, depth: 0, size: '0 B' }
  }
}

function TreeValueButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to copy"
      className={`cursor-pointer rounded hover:underline ${className}`}
    >
      {children}
    </button>
  )
}

export default function YamlTools() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<YamlToolsState>('yaml-tools', {
    input: '',
    activeTab: 'lint',
    jsonInput: '',
  })

  const formatter = useWorker<FormatterWorker>(
    () => new FormatterWorkerFactory(),
    ['format', 'detectLanguage', 'getSupportedLanguages']
  )
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [isFormatting, setIsFormatting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const formattingRef = useRef(false)
  const convertRef = useRef(false)

  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertOutput, setConvertOutput] = useState('')
  const [convertDirection, setConvertDirection] = useState<'yaml-to-json' | 'json-to-yaml'>(
    'yaml-to-json'
  )

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (formatter) {
        // The formatter is a WorkerRpc type, which does not have a terminate method.
        // The worker itself is managed by the useWorker hook, so no manual termination is needed.
      }
    }
  }, [formatter])

  useEffect(() => {
    setConvertOutput('')
    setConvertError(null)
  }, [state.input, state.jsonInput, convertDirection])

  const parsed = useMemo(() => parseYaml(state.input), [state.input])

  const stats = useMemo(() => {
    if (!parsed.ok) return null
    return yamlStats(parsed.data)
  }, [parsed])

  const handleFormat = useCallback(async () => {
    if (!formatter || formattingRef.current) return
    formattingRef.current = true
    setIsFormatting(true)
    try {
      const result = await formatter.format(state.input, { language: 'yaml' })
      updateState({ input: result })
      setError(null)
      setLastAction('Formatted YAML', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLastAction('Invalid YAML', 'error')
    } finally {
      formattingRef.current = false
      setIsFormatting(false)
    }
  }, [formatter, state.input, updateState, setLastAction])

  const handleMinify = useCallback(() => {
    if (!parsed.ok) return
    try {
      const minified = stringifyYaml(parsed.data).replace(/\n\s*\n/g, '\n')
      updateState({ input: minified })
      setError(null)
      setLastAction('Minified YAML', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLastAction('Minify failed', 'error')
    }
  }, [parsed, updateState, setLastAction])

  const handleSortKeys = useCallback(() => {
    if (!parsed.ok) return
    try {
      const sorted = sortKeysDeep(parsed.data)
      const result = stringifyYaml(sorted)
      updateState({ input: result })
      setError(null)
      setLastAction('Keys sorted', 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setLastAction('Sort failed', 'error')
    }
  }, [parsed, updateState, setLastAction])

  const handleConvert = useCallback(async () => {
    if (convertRef.current) return
    convertRef.current = true
    setIsConverting(true)
    setConvertError(null)
    try {
      if (convertDirection === 'yaml-to-json') {
        if (!state.input.trim()) {
          throw new Error('YAML input is empty')
        }
        const result = yamlToJson(state.input)
        if (!result) {
          throw new Error('Conversion produced empty result')
        }
        setConvertOutput(result)
        setLastAction('Converted YAML → JSON', 'success')
      } else {
        if (!state.jsonInput.trim()) {
          throw new Error('JSON input is empty')
        }
        const result = jsonToYaml(state.jsonInput)
        if (!result) {
          throw new Error('Conversion produced empty result')
        }
        setConvertOutput(result)
        setLastAction('Converted JSON → YAML', 'success')
      }
    } catch (e) {
      setConvertOutput('')
      setConvertError(e instanceof Error ? e.message : String(e))
      setLastAction('Conversion failed', 'error')
    } finally {
      convertRef.current = false
      setIsConverting(false)
    }
  }, [convertDirection, state.input, state.jsonInput, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />
      <div className="flex-1 overflow-hidden">
        {/* ── Lint & Format ─────────────────────────────────── */}
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <Button variant="primary" size="sm" onClick={handleFormat} disabled={isFormatting}>
                {isFormatting ? 'Formatting…' : 'Format'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleMinify} disabled={!parsed.ok}>
                Minify
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSortKeys} disabled={!parsed.ok}>
                Sort Keys
              </Button>
              <CopyButton text={state.input} />
              <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
              {parsed.ok && (
                <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
                  <CheckCircleIcon size={12} weight="fill" />
                  Valid
                </span>
              )}
              {!parsed.ok && (
                <span className="flex items-center gap-1 truncate text-xs text-[var(--color-error)]">
                  <XCircleIcon size={12} weight="fill" />
                  {parsed.error}
                </span>
              )}
              {stats && (
                <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
                  {stats.keys} keys · depth {stats.depth} · {stats.size}
                </span>
              )}
            </div>
            {error && (
              <Alert
                variant="error"
                className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
              >
                {error}
              </Alert>
            )}
            <div className="min-h-0 flex-1 overflow-hidden">
              <Editor
                theme={monacoTheme}
                language="yaml"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={monacoOptions}
              />
            </div>
          </div>
        )}

        {/* ── Tree View ─────────────────────────────────────── */}
        {state.activeTab === 'tree' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-1.5">
              {stats && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {stats.keys} keys · depth {stats.depth}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {parsed.ok ? (
                <YamlTree data={parsed.data} path="$" defaultExpanded={true} />
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">
                  {!parsed.ok
                    ? `Parse error: ${parsed.error}`
                    : 'Enter YAML in the Lint & Format tab'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── JSON ↔ YAML ───────────────────────────────────── */}
        {state.activeTab === 'convert' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
              <button
                type="button"
                onClick={() => {
                  setConvertDirection('yaml-to-json')
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  convertDirection === 'yaml-to-json'
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                YAML → JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setConvertDirection('json-to-yaml')
                }}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  convertDirection === 'json-to-yaml'
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                JSON → YAML
              </button>
              <Button variant="primary" size="sm" onClick={handleConvert} disabled={isConverting}>
                {isConverting ? 'Converting…' : 'Convert'}
              </Button>
              {convertOutput && <CopyButton text={convertOutput} />}
            </div>
            {convertError && (
              <Alert
                variant="error"
                className="rounded-none border-b border-[var(--color-border)] px-4 py-2"
              >
                {convertError}
              </Alert>
            )}
            <div className="flex flex-1 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-border)]">
                <div className="border-b border-[var(--color-border)] px-4 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    {convertDirection === 'yaml-to-json' ? 'YAML Input' : 'JSON Input'}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {convertDirection === 'yaml-to-json' ? (
                    <Editor
                      theme={monacoTheme}
                      language="yaml"
                      value={state.input}
                      onChange={(v) => updateState({ input: v ?? '' })}
                      options={monacoOptions}
                    />
                  ) : (
                    <Editor
                      theme={monacoTheme}
                      language="json"
                      value={state.jsonInput}
                      onChange={(v) => updateState({ jsonInput: v ?? '' })}
                      options={monacoOptions}
                    />
                  )}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="border-b border-[var(--color-border)] px-4 py-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    {convertDirection === 'yaml-to-json' ? 'JSON Output' : 'YAML Output'}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Editor
                    theme={monacoTheme}
                    language={convertDirection === 'yaml-to-json' ? 'json' : 'yaml'}
                    value={convertOutput}
                    options={{ ...monacoOptions, readOnly: true }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree View
// ---------------------------------------------------------------------------

function YamlTree({
  data,
  path,
  defaultExpanded = true,
}: {
  data: unknown
  path: string
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const setLastAction = useUiStore((s) => s.setLastAction)

  const copyValue = useCallback(
    (val: unknown) => {
      const text = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '')
      navigator.clipboard.writeText(text)
      setLastAction('Copied value', 'success')
    },
    [setLastAction]
  )

  if (data === null || data === undefined)
    return (
      <TreeValueButton className="text-[var(--color-text-muted)]" onClick={() => copyValue(null)}>
        null
      </TreeValueButton>
    )

  if (typeof data === 'boolean')
    return (
      <TreeValueButton className="text-[var(--color-warning)]" onClick={() => copyValue(data)}>
        {String(data)}
      </TreeValueButton>
    )

  if (typeof data === 'number')
    return (
      <TreeValueButton className="text-[var(--color-accent)]" onClick={() => copyValue(data)}>
        {data}
      </TreeValueButton>
    )

  if (typeof data === 'string')
    return (
      <TreeValueButton className="text-[var(--color-success)]" onClick={() => copyValue(data)}>
        {data}
      </TreeValueButton>
    )

  if (Array.isArray(data)) {
    return (
      <div className="ml-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? '▼' : '▶'} <span className="text-xs">[{data.length}]</span>
        </button>
        {expanded &&
          data.map((item, i) => (
            <div key={`${path}[${i}]`} className="ml-4">
              <span className="text-[var(--color-text-muted)]">{i}: </span>
              <YamlTree data={item} path={`${path}[${i}]`} defaultExpanded={defaultExpanded} />
            </div>
          ))}
      </div>
    )
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    return (
      <div className="ml-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {expanded ? '▼' : '▶'} <span className="text-xs">{`{${entries.length}}`}</span>
        </button>
        {expanded &&
          entries.map(([key, value]) => (
            <div key={key} className="ml-4">
              <span className="text-[var(--color-accent)]">{key}</span>
              <span className="text-[var(--color-text-muted)]">: </span>
              <YamlTree data={value} path={`${path}.${key}`} defaultExpanded={defaultExpanded} />
            </div>
          ))}
      </div>
    )
  }

  return <span>{String(data)}</span>
}
