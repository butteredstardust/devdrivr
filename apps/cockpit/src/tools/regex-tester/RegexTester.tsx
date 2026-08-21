import { useCallback, useMemo, useRef, useState } from 'react'
import { diffChars } from 'diff'
import { useToolState } from '@/hooks/useToolState'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SplitPane } from '@/components/shared/SplitPane'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Button } from '@/components/shared/Button'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { InlineInput } from '@/components/shared/InlineInput'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { Alert } from '@/components/shared/Alert'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { REGEX_TIMEOUT_MS, useRegexEvaluation } from '@/hooks/useRegexEvaluation'
import { MAX_REGEX_MATCHES } from '@/workers/regex.api'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useToolHistory } from '@/hooks/useToolHistory'
import { REGEX_TESTER_SAMPLE } from '@/lib/tool-samples'

type RegexTesterState = {
  pattern: string
  flags: string
  testString: string
  replacePattern: string
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

const FLAG_OPTIONS = ['g', 'i', 'm', 's', 'u', 'y', 'd', 'v'] as const
const FLAG_TITLES: Record<string, string> = {
  g: 'Global — find all matches',
  i: 'Case insensitive',
  m: 'Multiline — ^ and $ match line boundaries',
  s: 'Dotall — . matches newline',
  u: 'Unicode mode',
  y: 'Sticky — match only at the current scan position',
  d: 'Has indices — show capture offsets',
  v: 'Unicode sets mode',
}

const REGEX_PRESETS = [
  {
    label: 'Email',
    pattern: '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}',
    flags: 'gi',
    testString: 'ada@example.com',
  },
  {
    label: 'URL',
    pattern: 'https?://[^\\s]+',
    flags: 'gi',
    testString: 'Read https://example.com/docs',
  },
  {
    label: 'ISO date',
    pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    flags: 'g',
    testString: 'Released 2026-08-21',
  },
  {
    label: 'JWT',
    pattern: '^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$',
    flags: '',
    testString: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  },
  {
    label: 'Log line',
    pattern: '^\\[(?<time>[^]]+)\\] (?<level>\\w+): (?<message>.*)$',
    flags: 'gm',
    testString: '[12:00] INFO: Started',
  },
] as const

type RegexMode = 'match' | 'replace'

const MODE_OPTIONS: { value: RegexMode; label: string }[] = [
  { value: 'match', label: 'Match' },
  { value: 'replace', label: 'Replace' },
]

const TIMEOUT_MESSAGE = `Pattern timed out after ${REGEX_TIMEOUT_MS}ms — likely catastrophic backtracking. Edit the pattern or the test string to retry.`

/**
 * The sentence a screen reader hears when the match set changes.
 *
 * The visual UI states the count in two places — a badge in the pattern bar and the match-details
 * header — and neither is a live region, deliberately: making both live would announce every
 * keystroke twice. This is the single source, and it is a sentence rather than a bare number
 * because "3" on its own tells a listener nothing about what changed.
 */
export function describeMatches({
  pattern,
  error,
  count,
  groupCount,
  truncated,
}: {
  pattern: string
  error: string | null
  count: number
  groupCount: number
  truncated: boolean
}): string {
  if (!pattern) return ''
  if (error) return `Pattern error: ${error}`
  if (count === 0) return 'No matches'

  const head = truncated
    ? `Showing first ${count} matches, more were found`
    : `${count} match${count !== 1 ? 'es' : ''}`
  return groupCount > 0
    ? `${head}, ${groupCount} capture group${groupCount !== 1 ? 's' : ''}`
    : head
}

// ── Component ──────────────────────────────────────────────────────

export default function RegexTester() {
  const testStringRef = useRef<HTMLTextAreaElement>(null)
  const [state, updateState] = useToolState<RegexTesterState>('regex-tester', {
    pattern: '',
    flags: 'g',
    testString: '',
    replacePattern: '',
  })
  const copy = useCopyToClipboard()
  const { recordImmediate } = useToolHistory({ toolId: 'regex-tester' })
  const isUntouched = !state.pattern.trim() && !state.testString.trim()
  const [showRef, setShowRef] = useState(false)
  const [mode, setMode] = useState<RegexMode>('match')
  const [showDiff, setShowDiff] = useState(false)
  const patternRef = useRef<HTMLTextAreaElement>(null)

  // Evaluation runs in a terminable worker — a user pattern must never touch this thread.
  const evaluation = useRegexEvaluation({
    pattern: state.pattern,
    flags: state.flags,
    text: state.testString,
    replacement: state.replacePattern,
  })

  const timedOut = evaluation.status === 'timeout'
  const evaluated = evaluation.result
  // Memoised so the `?? []` fallback does not produce a new array identity on every
  // render and invalidate the copy callback below.
  const matches = useMemo(() => evaluated?.matches ?? [], [evaluated])
  const truncated = evaluated?.truncated ?? false
  const matchError = timedOut ? TIMEOUT_MESSAGE : (evaluated?.matchError ?? null)
  const replaceValue = evaluated?.replaceResult ?? state.testString
  const replaceError = timedOut ? TIMEOUT_MESSAGE : (evaluated?.replaceError ?? null)

  // Stable identity — React 19 compares `dangerouslySetInnerHTML` by object
  // identity, not by the `__html` string, so an inline literal re-writes
  // innerHTML on every render and wipes any selection in the highlight pane.
  const highlightProp = useMemo(
    () => ({
      __html:
        evaluated?.highlightHtml ||
        '<span style="color:var(--color-text-muted)">Matches will be highlighted here</span>',
    }),
    [evaluated]
  )

  // Character-level diff between source and substituted text (only computed when needed)
  const charDiff = useMemo(() => {
    if (!showDiff || mode !== 'replace') return null
    if (replaceError || !state.pattern || !state.testString) return null
    return diffChars(state.testString, replaceValue)
  }, [showDiff, mode, replaceValue, replaceError, state.pattern, state.testString])

  const diffStats = useMemo(() => {
    if (!charDiff) return null
    let added = 0
    let removed = 0
    for (const part of charDiff) {
      if (part.added) added += part.value.length
      else if (part.removed) removed += part.value.length
    }
    return { added, removed }
  }, [charDiff])

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
      if (matches.length === 0) return
      const text =
        format === 'json'
          ? JSON.stringify(
              matches.map((m) => ({
                match: m.full,
                index: m.index,
                length: m.length,
                groups: m.groups.length > 0 ? m.groups : undefined,
              })),
              null,
              2
            )
          : matches.map((m) => m.full).join('\n')
      const copied = await copy(text, {
        success: `Copied ${truncated ? `first ${matches.length}` : matches.length} match${matches.length !== 1 ? 'es' : ''} as ${format === 'json' ? 'JSON' : 'lines'}`,
        failure: 'Failed to copy',
      })
      if (copied) {
        recordImmediate({
          input: `/${state.pattern}/${state.flags}`,
          output: text,
          subTab: `matches-${format}`,
          success: true,
        })
      }
    },
    [matches, truncated, copy, recordImmediate, state.pattern, state.flags]
  )

  const handleCopyReplace = useCallback(async () => {
    const copied = await copy(replaceValue, {
      success: 'Copied replacement result',
      failure: 'Failed to copy',
    })
    if (copied) {
      recordImmediate({
        input: `/${state.pattern}/${state.flags} → ${state.replacePattern}`,
        output: replaceValue,
        subTab: 'replace',
        success: true,
      })
    }
  }, [copy, recordImmediate, replaceValue, state.flags, state.pattern, state.replacePattern])

  const matchCount = matches.length
  const groupCount = matches.reduce((n, m) => n + m.groups.length, 0)
  const hasGroups = groupCount > 0

  return (
    <ToolLayout fullBleed>
      {/* The only live region in this tool — see describeMatches. */}
      <div role="status" aria-live="polite" className="sr-only">
        {describeMatches({
          pattern: state.pattern,
          error: matchError,
          count: matchCount,
          groupCount,
          truncated,
        })}
      </div>
      <div className="flex h-full">
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Pattern bar */}
          <Toolbar aria-label="Regex pattern" className="gap-3">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">/</span>
            <TextArea
              ref={patternRef}
              value={state.pattern}
              onChange={(e) => updateState({ pattern: e.target.value })}
              placeholder="Enter regex pattern..."
              aria-label="Regex pattern"
              monospace
              rows={1}
              className="max-h-24 min-h-7 flex-1 resize-y py-1"
            />
            <span className="font-mono text-xs text-[var(--color-text-muted)]">/</span>
            <div className="flex gap-1">
              {FLAG_OPTIONS.map((flag) => (
                <Button
                  key={flag}
                  variant={state.flags.includes(flag) ? 'primary' : 'ghost'}
                  size="xs"
                  onClick={() => toggleFlag(flag)}
                  title={FLAG_TITLES[flag]}
                  aria-label={`${FLAG_TITLES[flag]} flag`}
                  aria-pressed={state.flags.includes(flag)}
                  className="h-6 w-6 font-bold"
                >
                  {flag}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRef(!showRef)}
              title={showRef ? 'Hide the regex reference' : 'Show the regex syntax reference'}
              aria-expanded={showRef}
            >
              {showRef ? 'Hide' : 'Ref'}
            </Button>
            <div className="flex shrink-0 gap-1">
              {REGEX_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    updateState({
                      pattern: preset.pattern,
                      flags: preset.flags,
                      testString: preset.testString,
                    })
                  }
                  title={`Load ${preset.label} preset`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {/* Only while both fields are untouched. A regex tool needs a pattern
                *and* a subject before it shows anything, so a cold start means
                inventing both — and the tax falls hardest on the user who came
                here because they are unsure of the syntax. Gone on the first
                keystroke, so it can never overwrite work in progress. */}
            {isUntouched && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  updateState({
                    pattern: REGEX_TESTER_SAMPLE.pattern,
                    flags: REGEX_TESTER_SAMPLE.flags,
                    testString: REGEX_TESTER_SAMPLE.testString,
                  })
                }
              >
                Load sample
              </Button>
            )}
            {matchError && (
              <Alert variant="error" className="px-2 py-0.5">
                {matchError}
              </Alert>
            )}
            {/* The bare number was ambiguous — 3 what? — and the capture-group
                count existed only in the sr-only live region, so sighted users
                had to count parentheses. Same `N matches · N groups` shape the
                document tools use for their status line. */}
            {!matchError && matchCount > 0 && (
              <div className="flex shrink-0 items-center gap-2" data-testid="match-count">
                <StatusBadge variant={truncated ? 'warning' : 'info'}>
                  {truncated ? `${matchCount}+` : matchCount}{' '}
                  {matchCount === 1 && !truncated ? 'match' : 'matches'}
                </StatusBadge>
                {groupCount > 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {groupCount} group{groupCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
            {!matchError && truncated && (
              <span className="text-xs text-[var(--color-warning)]">
                Showing first {MAX_REGEX_MATCHES} matches
              </span>
            )}
          </Toolbar>

          {/* Mode toggle + replace input */}
          <Toolbar aria-label="Regex mode">
            <SegmentedControl
              aria-label="Regex mode"
              options={MODE_OPTIONS}
              value={mode}
              onChange={setMode}
            />
            {mode === 'replace' && (
              <div className="flex flex-1 items-center gap-2">
                <InlineInput
                  variant="code"
                  value={state.replacePattern}
                  onChange={(e) => updateState({ replacePattern: e.target.value })}
                  placeholder="Replacement pattern ($1, $2, $<name>)..."
                  aria-label="Replacement pattern"
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" onClick={() => void handleCopyReplace()}>
                  Copy result
                </Button>
              </div>
            )}
            {mode === 'match' && matchCount > 0 && (
              <>
                <ToolbarSpacer />
                <ToolbarGroup label="Export matches">
                  <Button variant="secondary" size="sm" onClick={() => void exportMatches('lines')}>
                    Copy lines
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void exportMatches('json')}>
                    Copy JSON
                  </Button>
                </ToolbarGroup>
              </>
            )}
          </Toolbar>

          {/* Main panels */}
          <SplitPane storageKey="regex-tester" aria-label="Resize test string and matches">
            <div className="flex min-h-0 flex-1 flex-col">
              <PaneHeader title="Test String" />
              <TextArea
                ref={testStringRef}
                value={state.testString}
                onChange={(e) => updateState({ testString: e.target.value })}
                placeholder="Enter text to test against..."
                monospace
                size="md"
                className="flex-1 resize-none rounded-none border-0 bg-[var(--color-bg)] p-4 focus:border-0"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <PaneHeader
                title={mode === 'replace' ? 'Replace Preview' : 'Highlighted Matches'}
                status={
                  diffStats && mode === 'replace' && state.pattern && !replaceError ? (
                    <>
                      <span className="text-[var(--color-success)]">+{diffStats.added}</span>
                      {' / '}
                      <span className="text-[var(--color-error)]">-{diffStats.removed}</span>
                      {' chars'}
                    </>
                  ) : undefined
                }
                actions={
                  mode === 'replace' && state.pattern && state.testString && !replaceError ? (
                    <Button
                      variant={showDiff ? 'secondary' : 'ghost'}
                      size="xs"
                      onClick={() => setShowDiff((v) => !v)}
                      title={showDiff ? 'Show plain result' : 'Show diff between source and result'}
                    >
                      Diff
                    </Button>
                  ) : undefined
                }
              />
              {mode === 'replace' ? (
                <div className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm">
                  {replaceError ? (
                    <Alert variant="error">{replaceError}</Alert>
                  ) : !state.pattern || !state.testString ? (
                    <span className="text-[var(--color-text-muted)]">
                      Replace preview will appear here
                    </span>
                  ) : charDiff ? (
                    charDiff.map((part, i) => (
                      <span
                        key={i}
                        style={{
                          background: part.added
                            ? 'color-mix(in srgb, var(--color-success) 20%, transparent)'
                            : part.removed
                              ? 'color-mix(in srgb, var(--color-error) 20%, transparent)'
                              : undefined,
                          color: part.added
                            ? 'var(--color-success)'
                            : part.removed
                              ? 'var(--color-error)'
                              : 'var(--color-text)',
                          textDecoration: part.removed ? 'line-through' : undefined,
                        }}
                      >
                        {part.value}
                      </span>
                    ))
                  ) : (
                    <span className="text-[var(--color-text)]">{replaceValue}</span>
                  )}
                </div>
              ) : timedOut ? (
                <div className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm">
                  <span className="text-[var(--color-error)]">{TIMEOUT_MESSAGE}</span>
                </div>
              ) : (
                <div
                  className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-[var(--color-text)]"
                  dangerouslySetInnerHTML={highlightProp}
                />
              )}
            </div>
          </SplitPane>

          {/* Match details */}
          {matchCount > 0 && (
            <div className="max-h-48 shrink-0 overflow-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="mb-2 flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
                <span>
                  {truncated ? `First ${matchCount}` : matchCount} match
                  {matchCount !== 1 ? 'es' : ''}
                  {hasGroups ? ` · ${groupCount} groups` : ''}
                </span>
              </div>
              {matches.map((m, i) => (
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  key={i}
                  onClick={() => {
                    const input = testStringRef.current
                    if (!input) return
                    input.focus()
                    input.setSelectionRange(m.index, m.index + m.length)
                  }}
                  className="mb-1.5 flex w-full items-start gap-3 rounded p-1 text-left text-xs hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  title={`Select match ${i + 1} in the test string`}
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
                            <span className="opacity-60">${g.index}</span>
                          )}
                          {'='}
                          <code className="text-[var(--color-text)]">{g.value}</code>
                          {g.start !== undefined && g.end !== undefined && (
                            <span className="ml-1 opacity-70">
                              [{g.start}–{g.end}]
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-2xs text-[var(--color-text-muted)]">
                    Select
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Reference sidebar */}
        {showRef && (
          <div className="w-56 shrink-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-2 font-mono text-xs text-[var(--color-text-muted)]">
              Reference · click to insert
            </div>
            {REFERENCE_CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-3">
                <SectionLabel as="div" className="mb-1">
                  {cat.label}
                </SectionLabel>
                {cat.items.map((r) => (
                  <Button
                    key={r.pattern}
                    variant="ghost"
                    size="sm"
                    onClick={() => insertPattern(r.pattern)}
                    className="mb-0.5 w-full items-start justify-start gap-1.5 text-left"
                  >
                    <code className="shrink-0 text-[var(--color-accent)]">{r.pattern}</code>
                    <span className="text-[var(--color-text-muted)]">{r.desc}</span>
                  </Button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolLayout>
  )
}
