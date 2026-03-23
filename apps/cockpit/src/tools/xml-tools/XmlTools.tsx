import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { useWorker } from '@/hooks/useWorker'
import { TabBar } from '@/components/shared/TabBar'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'
import type { XmlWorker } from '@/workers/xml.worker'
import XmlWorkerFactory from '@/workers/xml.worker?worker'

type XmlToolsState = {
  input: string
  activeTab: string
  xpathQuery: string
  indent: number
}

const TABS = [
  { id: 'lint', label: 'Lint & Format' },
  { id: 'tree', label: 'Tree View' },
  { id: 'json', label: 'XML → JSON' },
  { id: 'xpath', label: 'XPath' },
]

// ── Tree View types ──────────────────────────────────────────────────

type TreeNode =
  | { type: 'element'; name: string; attributes: Record<string, string>; children: TreeNode[] }
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }
  | { type: 'cdata'; value: string }
  | { type: 'pi'; name: string; value: string }

function parseXmlToTree(xml: string): TreeNode | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) return null
    return domToTreeNode(doc.documentElement)
  } catch {
    return null
  }
}

function domToTreeNode(node: Node): TreeNode | null {
  if (node.nodeType === 1) {
    const el = node as Element
    const attrs: Record<string, string> = {}
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes.item(i)
      if (a) attrs[a.name] = a.value
    }
    const children: TreeNode[] = []
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = domToTreeNode(el.childNodes[i]!)
      if (child) children.push(child)
    }
    return { type: 'element', name: el.tagName, attributes: attrs, children }
  }
  if (node.nodeType === 3) {
    const text = (node.textContent ?? '').trim()
    if (!text) return null
    return { type: 'text', value: text }
  }
  if (node.nodeType === 8) {
    return { type: 'comment', value: node.textContent ?? '' }
  }
  if (node.nodeType === 4) {
    return { type: 'cdata', value: node.textContent ?? '' }
  }
  if (node.nodeType === 7) {
    return { type: 'pi', name: node.nodeName, value: node.textContent ?? '' }
  }
  return null
}

// ── Tree Node Component ──────────────────────────────────────────────

function TreeNodeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 3)
  const indent = depth * 16

  if (node.type === 'text') {
    return (
      <div style={{ paddingLeft: indent }} className="flex items-center gap-1 py-0.5 text-xs">
        <span className="text-[var(--color-success)]">&quot;{node.value}&quot;</span>
      </div>
    )
  }

  if (node.type === 'comment') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs text-[var(--color-text-muted)]">
        &lt;!-- {node.value} --&gt;
      </div>
    )
  }

  if (node.type === 'cdata') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs text-[var(--color-warning)]">
        &lt;![CDATA[{node.value}]]&gt;
      </div>
    )
  }

  if (node.type === 'pi') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs text-[var(--color-text-muted)]">
        &lt;?{node.name} {node.value}?&gt;
      </div>
    )
  }

  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        style={{ paddingLeft: indent }}
        className="flex cursor-pointer items-center gap-1 py-0.5 text-xs hover:bg-[var(--color-surface-hover)]"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <span className="w-3 text-center text-[var(--color-text-muted)]">
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="text-[var(--color-accent)]">&lt;{node.name}</span>
        {Object.entries(node.attributes).map(([k, v]) => (
          <span key={k}>
            <span className="text-[var(--color-info)]"> {k}</span>
            <span className="text-[var(--color-text-muted)]">=</span>
            <span className="text-[var(--color-warning)]">&quot;{v}&quot;</span>
          </span>
        ))}
        <span className="text-[var(--color-accent)]">
          {hasChildren ? '>' : ' />'}
        </span>
        {!hasChildren && (
          <span className="ml-1 text-[var(--color-text-muted)]">(empty)</span>
        )}
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child, i) => (
          <TreeNodeRow key={i} node={child} depth={depth + 1} />
        ))}
      {expanded && hasChildren && (
        <div
          style={{ paddingLeft: indent }}
          className="py-0.5 text-xs text-[var(--color-accent)]"
        >
          <span className="w-3 inline-block" />
          &lt;/{node.name}&gt;
        </div>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────

export default function XmlTools() {
  useMonacoTheme()
  const [state, updateState] = useToolState<XmlToolsState>('xml-tools', {
    input: '',
    activeTab: 'lint',
    xpathQuery: '',
    indent: 2,
  })

  const worker = useWorker<XmlWorker>(
    () => new XmlWorkerFactory(),
    ['validate', 'format', 'minify', 'toJson', 'stats', 'queryXPath']
  )

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [error, setError] = useState<string | null>(null)
  const [xpathResults, setXpathResults] = useState<string[]>([])
  const [jsonOutput, setJsonOutput] = useState<string>('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [stats, setStats] = useState<{ elements: number; attributes: number; textNodes: number; depth: number } | null>(null)

  // Debounced stats computation
  const statsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!worker || !state.input.trim()) {
      setStats(null)
      return
    }
    if (statsTimer.current) clearTimeout(statsTimer.current)
    let cancelled = false
    statsTimer.current = setTimeout(() => {
      worker.stats(state.input).then((s) => {
        if (!cancelled) setStats(s)
      }).catch(() => {})
    }, 500)
    return () => {
      cancelled = true
      if (statsTimer.current) clearTimeout(statsTimer.current)
    }
  }, [worker, state.input])

  const handleFormat = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.format(state.input, state.indent)
    if (result.valid && result.formatted) {
      updateState({ input: result.formatted })
      setError(null)
      setLastAction('Formatted XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, state.indent, updateState, setLastAction])

  const handleMinify = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.minify(state.input)
    if (result.valid && result.formatted) {
      updateState({ input: result.formatted })
      setError(null)
      setLastAction('Minified XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, updateState, setLastAction])

  const handleValidate = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.validate(state.input)
    if (result.valid) {
      setError(null)
      setLastAction('Valid XML', 'success')
    } else {
      setError(result.errors.join('\n'))
      setLastAction(`${result.errors.length} error(s)`, 'error')
    }
  }, [worker, state.input, setLastAction])

  const handleToJson = useCallback(async () => {
    if (!worker || !state.input.trim()) return
    const result = await worker.toJson(state.input)
    if (result.valid && result.json) {
      setJsonOutput(result.json)
      setJsonError(null)
      setLastAction('Converted to JSON', 'success')
    } else {
      setJsonError(result.error ?? 'Conversion failed')
      setJsonOutput('')
      setLastAction('Conversion failed', 'error')
    }
  }, [worker, state.input, setLastAction])

  const handleXPath = useCallback(async () => {
    if (!worker || !state.input.trim() || !state.xpathQuery.trim()) return
    const result = await worker.queryXPath(state.input, state.xpathQuery)
    setXpathResults(result.matches)
    setLastAction(`${result.count} match(es)`, result.count > 0 ? 'success' : 'info')
  }, [worker, state.input, state.xpathQuery, setLastAction])

  const tree = useMemo(() => {
    if (!state.input.trim()) return null
    return parseXmlToTree(state.input)
  }, [state.input])

  return (
    <div className="flex h-full flex-col">
      <TabBar
        tabs={TABS}
        activeTab={state.activeTab}
        onTabChange={(id) => updateState({ activeTab: id })}
      />

      {/* Stats bar */}
      {stats && state.input.trim() && (
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-[var(--color-text-muted)]">
          <span>{stats.elements} elements</span>
          <span>{stats.attributes} attributes</span>
          <span>{stats.textNodes} text nodes</span>
          <span>depth {stats.depth}</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {/* ── Lint & Format ─────────────────────────────── */}
        {state.activeTab === 'lint' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleFormat}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Format
              </button>
              <button
                onClick={handleMinify}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Minify
              </button>
              <button
                onClick={handleValidate}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Validate
              </button>
              <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                Indent
                <select
                  value={state.indent}
                  onChange={(e) => updateState({ indent: Number(e.target.value) })}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs text-[var(--color-text)] outline-none"
                >
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
              <CopyButton text={state.input} />
            </div>
            {error && (
              <div className="max-h-24 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                <pre className="whitespace-pre-wrap">{error}</pre>
              </div>
            )}
            <div className="flex-1">
              <Editor
                language="xml"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}

        {/* ── Tree View ─────────────────────────────────── */}
        {state.activeTab === 'tree' && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto p-4">
              {tree ? (
                <TreeNodeRow node={tree} />
              ) : state.input.trim() ? (
                <div className="text-sm text-[var(--color-error)]">
                  Could not parse XML — check for errors in Lint & Format tab
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">
                  Enter XML in the Lint & Format tab
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── XML → JSON ────────────────────────────────── */}
        {state.activeTab === 'json' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <button
                onClick={handleToJson}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Convert
              </button>
              {jsonOutput && <CopyButton text={jsonOutput} label="Copy JSON" />}
            </div>
            {jsonError && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
                {jsonError}
              </div>
            )}
            <div className="flex-1 overflow-auto">
              {jsonOutput ? (
                <Editor
                  language="json"
                  value={jsonOutput}
                  options={{ ...EDITOR_OPTIONS, readOnly: true }}
                />
              ) : (
                <div className="p-4 text-sm text-[var(--color-text-muted)]">
                  Enter XML in the Lint & Format tab, then click Convert
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── XPath ─────────────────────────────────────── */}
        {state.activeTab === 'xpath' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
              <input
                value={state.xpathQuery}
                onChange={(e) => updateState({ xpathQuery: e.target.value })}
                placeholder="Enter XPath expression (e.g. /root/child)"
                className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleXPath()
                }}
              />
              <button
                onClick={handleXPath}
                className="rounded border border-[var(--color-accent)] px-3 py-1 font-pixel text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
              >
                Query
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {xpathResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {xpathResults.length} match(es)
                  </div>
                  {xpathResults.map((r, i) => (
                    <div
                      key={i}
                      className="group flex items-start gap-2"
                    >
                      <pre className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]">
                        {r}
                      </pre>
                      <CopyButton text={r} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-muted)]">
                  Enter an XPath expression and click Query (or press Enter)
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
