import { useCallback, useMemo, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { CopyButton } from '@/components/shared/CopyButton'
import { TabBar } from '@/components/shared/TabBar'
import { useUiStore } from '@/stores/ui.store'

type RegexTesterState = {
  pattern: string
  flags: string
  testString: string
  replacePattern: string
}

type Match = {
  full: string
  index: number
  length: number
  groups: Array<{ name: string | null; value: string }>
}

// ── Reference data ─────────────────────────────────────────────────

const REFERENCE_CATEGORIES = [
  {
    label: 'Characters',
    items: [
      { pattern: '.', desc: 'Any character except newline' },
      { pattern: '\\d', desc: 'Digit [0-9]' },
      { pattern: '\\D', desc: 'Non-digit' },
      { pattern: '\\w', desc: 'Word char [a-zA-Z0-9_]' },
      { pattern: '\\W', desc: 'Non-word char' },
      { pattern: '\\s', desc: 'Whitespace' },
      { pattern: '\\S', desc: 'Non-whitespace' },
    ],
  },
  {
    label: 'Anchors',
    items: [
      { pattern: '^', desc: 'Start of string/line' },
      { pattern: '$', desc: 'End of string/line' },
      { pattern: '\\b', desc: 'Word boundary' },
      { pattern: '\\B', desc: 'Non-word boundary' },
    ],
  },
  {
    label: 'Quantifiers',
    items: [
      { pattern: '*', desc: '0 or more' },
      { pattern: '+', desc: '1 or more' },
      { pattern: '?', desc: '0 or 1' },
      { pattern: '{n}', desc: 'Exactly n' },
      { pattern: '{n,}', desc: 'n or more' },
      { pattern: '{n,m}', desc: 'Between n and m' },
    ],
  },
  {
    label: 'Groups & Lookaround',
    items: [
      { pattern: '()', desc: 'Capture group' },
      { pattern: '(?:)', desc: 'Non-capture group' },
      { pattern: '(?<name>)', desc: 'Named group' },
      { pattern: '|', desc: 'Alternation (or)' },
      { pattern: '[abc]', desc: 'Character class' },
      { pattern: '[^abc]', desc: 'Negated class' },
      { pattern: '(?=)', desc: 'Positive lookahead' },
      { pattern: '(?!)', desc: 'Negative lookahead' },
      { pattern: '(?<=)', desc: 'Positive lookbehind' },
      { pattern: '(?<!)', desc: 'Negative lookbehind' },
    ],
  },
]

const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u'] as const
const FLAG_TITLES: Record<string, string> = {
  g: 'Global — find all matches',
  i: 'Case insensitive',
  m: 'Multiline — ^ and $ match line boundaries',
  s: 'Dotall — . matches newline',
  u: 'Unicode mode',
}

const MODE_TABS = [
  { id: 'match', label: 'Match' },
  { id: 'replace', label: 'Replace' },
]

// ── Matching logic ─────────────────────────────────────────────────

function findMatches(
  pattern: string,
  flags: string,
  text: string
): { matches: Match[]; error: string | null } {
  if (!pattern) return { matches: [], error: null }
  try {
    const re = new RegExp(pattern, flags)
    const matches: Match[] = []

    if (flags.includes('g')) {
      let m: RegExpExecArray | null
      let guard = 0
      while ((m = re.exec(text)) !== null && guard < 1000) {
        guard++
        const groups: Match['groups'] = []
        for (let i = 1; i < m.length; i++) {
          const name = m.groups
            ? (Object.entries(m.groups).find(([, v]) => v === m![i])?.[0] ?? null)
            : null
          groups.push({ name, value: m[i] ?? '' })
        }
        matches.push({ full: m[0], index: m.index, length: m[0].length, groups })
        if (m[0] === '') re.lastIndex++
      }
    } else {
      const m = re.exec(text)
      if (m) {
        const groups: Match['groups'] = []
        for (let i = 1; i < m.length; i++) {
          const name = m.groups
            ? (Object.entries(m.groups).find(([, v]) => v === m![i])?.[0] ?? null)
            : null
          groups.push({ name, value: m[i] ?? '' })
        }
        matches.push({ full: m[0], index: m.index, length: m[0].length, groups })
      }
    }

    return { matches, error: null }
  } catch (e) {
    return { matches: [], error: (e as Error).message }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const MATCH_COLORS = [
  { bg: 'var(--color-accent)', text: 'var(--color-bg)' },
  { bg: 'var(--color-info)', text: 'var(--color-bg)' },
]

function highlightMatches(text: string, pattern: string, flags: string): string {
  if (!pattern || !text) return ''
  try {
    const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')
    const parts: string[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    let guard = 0
    let colorIdx = 0
    while ((m = re.exec(text)) !== null && guard < 1000) {
      guard++
      parts.push(escapeHtml(text.slice(lastIndex, m.index)))
      const c = MATCH_COLORS[colorIdx % MATCH_COLORS.length]!
      parts.push(
        `<mark style="background:${c.bg};color:${c.text};border-radius:2px;padding:0 2px">${escapeHtml(m[0])}</mark>`
      )
      colorIdx++
      lastIndex = m.index + m[0].length
      if (m[0] === '') re.lastIndex++
    }
    parts.push(escapeHtml(text.slice(lastIndex)))
    return parts.join('')
  } catch {
    return escapeHtml(text)
  }
}

function computeReplace(
  text: string,
  pattern: string,
  flags: string,
  replacement: string
): { result: string; error: string | null } {
  if (!pattern || !text) return { result: text, error: null }
  try {
    const re = new RegExp(pattern, flags)
    return { result: text.replace(re, replacement), error: null }
  } catch (e) {
    return { result: text, error: (e as Error).message }
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function RegexTester() {
  const [state, updateState] = useToolState<RegexTesterState>('regex-tester', {
    pattern: '',
    flags: 'g',
    testString: '',
    replacePattern: '',
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [showRef, setShowRef] = useState(false)
  const [mode, setMode] = useState('match')
  const patternRef = useRef<HTMLInputElement>(null)

  const result = useMemo(
    () => findMatches(state.pattern, state.flags, state.testString),
    [state.pattern, state.flags, state.testString]
  )

  const highlighted = useMemo(
    () => highlightMatches(state.testString, state.pattern, state.flags),
    [state.testString, state.pattern, state.flags]
  )

  const replaceResult = useMemo(
    () => computeReplace(state.testString, state.pattern, state.flags, state.replacePattern),
    [state.testString, state.pattern, state.flags, state.replacePattern]
  )

  const toggleFlag = useCallback(
    (flag: string) => {
      const newFlags = state.flags.includes(flag)
        ? state.flags.replace(flag, '')
        : state.flags + flag
      updateState({ flags: newFlags })
    },
    [state.flags, updateState]
  )

  const insertPattern = useCallback(
    (text: string) => {
      const input = patternRef.current
      if (!input) {
        updateState({ pattern: state.pattern + text })
        return
      }
      const start = input.selectionStart ?? state.pattern.length
      const end = input.selectionEnd ?? start
      const next = state.pattern.slice(0, start) + text + state.pattern.slice(end)
      updateState({ pattern: next })
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        input.focus()
        const pos = start + text.length
        input.setSelectionRange(pos, pos)
      })
    },
    [state.pattern, updateState]
  )

  const exportMatches = useCallback(
    async (format: 'lines' | 'json') => {
      if (result.matches.length === 0) return
      const text =
        format === 'json'
          ? JSON.stringify(
              result.matches.map((m) => ({
                match: m.full,
                index: m.index,
                length: m.length,
                groups: m.groups.length > 0 ? m.groups : undefined,
              })),
              null,
              2
            )
          : result.matches.map((m) => m.full).join('\n')
      try {
        await navigator.clipboard.writeText(text)
        setLastAction(
          `Copied ${result.matches.length} match${result.matches.length !== 1 ? 'es' : ''} as ${format === 'json' ? 'JSON' : 'lines'}`,
          'success'
        )
      } catch {
        setLastAction('Failed to copy', 'error')
      }
    },
    [result.matches, setLastAction]
  )

  const matchCount = result.matches.length
  const hasGroups = result.matches.some((m) => m.groups.length > 0)

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Pattern bar */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">/</span>
          <input
            ref={patternRef}
            value={state.pattern}
            onChange={(e) => updateState({ pattern: e.target.value })}
            placeholder="Enter regex pattern..."
            className="flex-1 border-none bg-transparent font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
          />
          <span className="font-pixel text-xs text-[var(--color-text-muted)]">/</span>
          <div className="flex gap-1">
            {FLAG_OPTIONS.map((flag) => (
              <button
                key={flag}
                onClick={() => toggleFlag(flag)}
                title={FLAG_TITLES[flag]}
                className={`h-6 w-6 rounded text-xs font-bold ${
                  state.flags.includes(flag)
                    ? 'bg-[var(--color-accent)] text-[var(--color-bg)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {flag}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRef(!showRef)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            {showRef ? 'Hide' : 'Ref'}
          </button>
          {result.error && (
            <span className="text-xs text-[var(--color-error)]">{result.error}</span>
          )}
          {!result.error && matchCount > 0 && (
            <span className="rounded-full bg-[var(--color-accent-dim)] px-2 py-0.5 text-xs font-bold text-[var(--color-accent)]">
              {matchCount}
            </span>
          )}
        </div>

        {/* Mode tabs + replace input */}
        <div className="flex items-center border-b border-[var(--color-border)]">
          <TabBar tabs={MODE_TABS} activeTab={mode} onTabChange={setMode} />
          {mode === 'replace' && (
            <div className="flex flex-1 items-center gap-2 px-3">
              <input
                value={state.replacePattern}
                onChange={(e) => updateState({ replacePattern: e.target.value })}
                placeholder="Replacement pattern ($1, $2, $<name>)..."
                className="flex-1 border-none bg-transparent font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
              />
              <CopyButton text={replaceResult.result} label="Copy result" />
            </div>
          )}
          {mode === 'match' && matchCount > 0 && (
            <div className="ml-auto flex items-center gap-1 pr-3">
              <button
                onClick={() => exportMatches('lines')}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Copy lines
              </button>
              <button
                onClick={() => exportMatches('json')}
                className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
              >
                Copy JSON
              </button>
            </div>
          )}
        </div>

        {/* Main panels */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Test String
            </div>
            <textarea
              value={state.testString}
              onChange={(e) => updateState({ testString: e.target.value })}
              placeholder="Enter text to test against..."
              className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
            />
          </div>
          <div className="flex w-1/2 flex-col">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              {mode === 'replace' ? 'Replace Preview' : 'Highlighted Matches'}
            </div>
            {mode === 'replace' ? (
              <div className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-[var(--color-text)]">
                {replaceResult.error ? (
                  <span className="text-[var(--color-error)]">{replaceResult.error}</span>
                ) : state.pattern && state.testString ? (
                  replaceResult.result
                ) : (
                  <span className="text-[var(--color-text-muted)]">
                    Replace preview will appear here
                  </span>
                )}
              </div>
            ) : (
              <div
                className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-[var(--color-text)]"
                dangerouslySetInnerHTML={{
                  __html:
                    highlighted ||
                    '<span style="color:var(--color-text-muted)">Matches will be highlighted here</span>',
                }}
              />
            )}
          </div>
        </div>

        {/* Match details */}
        {matchCount > 0 && (
          <div className="max-h-48 shrink-0 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 flex items-center gap-2 font-pixel text-xs text-[var(--color-text-muted)]">
              <span>
                {matchCount} match{matchCount !== 1 ? 'es' : ''}
                {hasGroups ? ` · ${result.matches.reduce((n, m) => n + m.groups.length, 0)} groups` : ''}
              </span>
            </div>
            {result.matches.map((m, i) => (
              <div
                key={i}
                className="mb-1.5 flex items-start gap-3 rounded p-1 text-xs hover:bg-[var(--color-surface-hover)]"
              >
                <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
                  #{i + 1}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
                  {m.index}–{m.index + m.length}
                </span>
                <code className="font-bold text-[var(--color-accent)]">{m.full}</code>
                {m.groups.length > 0 && (
                  <span className="flex flex-wrap gap-x-2 text-[var(--color-text-muted)]">
                    {m.groups.map((g, j) => (
                      <span key={j}>
                        {g.name ? (
                          <span className="text-[var(--color-info)]">{g.name}</span>
                        ) : (
                          <span className="opacity-60">${j + 1}</span>
                        )}
                        {'='}
                        <code className="text-[var(--color-text)]">{g.value}</code>
                      </span>
                    ))}
                  </span>
                )}
                <CopyButton text={m.full} label="Copy" className="ml-auto shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reference sidebar */}
      {showRef && (
        <div className="w-56 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="mb-2 font-pixel text-xs text-[var(--color-text-muted)]">
            Reference · click to insert
          </div>
          {REFERENCE_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-3">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                {cat.label}
              </div>
              {cat.items.map((r) => (
                <button
                  key={r.pattern}
                  onClick={() => insertPattern(r.pattern)}
                  className="mb-0.5 flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-[var(--color-surface-hover)]"
                >
                  <code className="shrink-0 text-[var(--color-accent)]">{r.pattern}</code>
                  <span className="text-[var(--color-text-muted)]">{r.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
