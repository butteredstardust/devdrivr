import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

// ── Types ────────────────────────────────────────────────────────────

type ViewMode = 'split' | 'edit' | 'preview'

type HtmlValidatorState = {
  input: string
  viewMode: ViewMode
  showRules: boolean
  disabledRules: string[]
}

type HtmlError = {
  message: string
  line: number
  col: number
  type: 'error' | 'warning'
  rule: string
}

// ── HTMLHint Rules ───────────────────────────────────────────────────

type RuleConfig = {
  id: string
  label: string
  category: 'structure' | 'attributes' | 'accessibility' | 'style'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue: any
}

const ALL_RULES: RuleConfig[] = [
  { id: 'tagname-lowercase', label: 'Tag names lowercase', category: 'structure', defaultValue: true },
  { id: 'tag-pair', label: 'Tag pairs must match', category: 'structure', defaultValue: true },
  { id: 'spec-char-escape', label: 'Special chars escaped', category: 'structure', defaultValue: true },
  { id: 'attr-lowercase', label: 'Attribute names lowercase', category: 'attributes', defaultValue: true },
  { id: 'attr-value-double-quotes', label: 'Double quotes for values', category: 'attributes', defaultValue: true },
  { id: 'attr-no-duplication', label: 'No duplicate attributes', category: 'attributes', defaultValue: true },
  { id: 'attr-unsafe-chars', label: 'No unsafe chars in attrs', category: 'attributes', defaultValue: true },
  { id: 'id-unique', label: 'IDs must be unique', category: 'attributes', defaultValue: true },
  { id: 'id-class-value', label: 'ID/class naming: dash-case', category: 'attributes', defaultValue: 'dash' },
  { id: 'src-not-empty', label: 'src not empty', category: 'attributes', defaultValue: true },
  { id: 'title-require', label: 'Title tag required', category: 'accessibility', defaultValue: true },
  { id: 'alt-require', label: 'Alt text on images', category: 'accessibility', defaultValue: true },
  { id: 'doctype-first', label: 'Doctype required', category: 'structure', defaultValue: false },
  { id: 'tag-self-close', label: 'Self-closing tags', category: 'style', defaultValue: false },
  { id: 'head-script-disabled', label: 'No scripts in head', category: 'style', defaultValue: false },
]

const RULE_CATEGORIES = ['structure', 'attributes', 'accessibility', 'style'] as const

// ── Validation ───────────────────────────────────────────────────────

async function validateHtml(html: string, disabledRules: string[]): Promise<HtmlError[]> {
  const { HTMLHint } = await import('htmlhint')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruleset: Record<string, any> = {}
  for (const rule of ALL_RULES) {
    ruleset[rule.id] = disabledRules.includes(rule.id) ? false : rule.defaultValue
  }
  const results = HTMLHint.verify(html, ruleset)
  return results.map((r) => ({
    message: r.message,
    line: r.line,
    col: r.col,
    type: (r.type as string) === 'error' ? ('error' as const) : ('warning' as const),
    rule: r.rule.id,
  }))
}

// ── HTML Stats ───────────────────────────────────────────────────────

type HtmlStats = {
  tags: number
  depth: number
  inlineStyles: number
  inlineScripts: number
  headings: { level: number; text: string }[]
}

function computeStats(html: string): HtmlStats {
  const tags = (html.match(/<[a-zA-Z][\w-]*/g) ?? []).length
  const inlineStyles = (html.match(/style\s*=/gi) ?? []).length
  const inlineScripts = (html.match(/<script[\s>]/gi) ?? []).length

  // Compute nesting depth
  let depth = 0
  let maxDepth = 0
  const tagPattern = /<\/?([a-zA-Z][\w-]*)[^>]*\/?>/g
  const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'])
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(html)) !== null) {
    const full = match[0]!
    const tag = match[1]!.toLowerCase()
    if (selfClosing.has(tag) || full.endsWith('/>')) continue
    if (full.startsWith('</')) {
      depth--
    } else {
      depth++
      maxDepth = Math.max(maxDepth, depth)
    }
  }

  // Extract headings
  const headings: { level: number; text: string }[] = []
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  let hMatch: RegExpExecArray | null
  while ((hMatch = headingRe.exec(html)) !== null) {
    headings.push({
      level: parseInt(hMatch[1]!),
      text: hMatch[2]!.replace(/<[^>]+>/g, '').trim(),
    })
  }

  return { tags, depth: maxDepth, inlineStyles, inlineScripts, headings }
}

// ── Starter Templates ────────────────────────────────────────────────

const STARTERS: Record<string, { label: string; html: string }> = {
  minimal: {
    label: 'Minimal',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
</head>
<body>
  <h1>Hello World</h1>
  <p>Start editing to see validation results.</p>
</body>
</html>`,
  },
  article: {
    label: 'Article',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Article</title>
</head>
<body>
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <article>
      <h1>Article Title</h1>
      <p>Published on <time datetime="2026-03-23">March 23, 2026</time></p>
      <p>Article content goes here.</p>
      <h2>Section One</h2>
      <p>Section one content.</p>
      <h2>Section Two</h2>
      <p>Section two content.</p>
    </article>
  </main>
  <footer>
    <p>&copy; 2026</p>
  </footer>
</body>
</html>`,
  },
  form: {
    label: 'Form',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Contact Form</title>
</head>
<body>
  <h1>Contact Us</h1>
  <form action="/submit" method="post">
    <div>
      <label for="name">Name</label>
      <input type="text" id="name" name="name" required>
    </div>
    <div>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required>
    </div>
    <div>
      <label for="message">Message</label>
      <textarea id="message" name="message" rows="4"></textarea>
    </div>
    <button type="submit">Send</button>
  </form>
</body>
</html>`,
  },
}

// ── Component ────────────────────────────────────────────────────────

export default function HtmlValidator() {
  const monacoTheme = useMonacoTheme()
  const [state, updateState] = useToolState<HtmlValidatorState>('html-validator', {
    input: '',
    viewMode: 'split',
    showRules: false,
    disabledRules: [],
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [errors, setErrors] = useState<HtmlError[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live validation
  useEffect(() => {
    if (!state.input.trim()) {
      setErrors([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const errs = await validateHtml(state.input, state.disabledRules)
      setErrors(errs)
      const errorCount = errs.filter((e) => e.type === 'error').length
      const warnCount = errs.filter((e) => e.type === 'warning').length
      if (errs.length === 0) {
        setLastAction('Valid HTML', 'success')
      } else {
        setLastAction(`${errorCount} error(s), ${warnCount} warning(s)`, errorCount > 0 ? 'error' : 'info')
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, state.disabledRules, setLastAction])

  const stats = useMemo(() => {
    if (!state.input.trim()) return null
    return computeStats(state.input)
  }, [state.input])

  const errorCount = errors.filter((e) => e.type === 'error').length
  const warnCount = errors.filter((e) => e.type === 'warning').length

  const toggleRule = useCallback(
    (ruleId: string) => {
      const disabled = state.disabledRules.includes(ruleId)
        ? state.disabledRules.filter((r) => r !== ruleId)
        : [...state.disabledRules, ruleId]
      updateState({ disabledRules: disabled })
    },
    [state.disabledRules, updateState]
  )

  const showEditor = state.viewMode === 'split' || state.viewMode === 'edit'
  const showPreview = state.viewMode === 'split' || state.viewMode === 'preview'

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        {/* View mode */}
        {(['edit', 'split', 'preview'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => updateState({ viewMode: mode })}
            className={`rounded border px-2 py-0.5 text-xs ${
              state.viewMode === mode
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {mode === 'edit' ? 'Edit' : mode === 'split' ? 'Split' : 'Preview'}
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />

        {/* Starters */}
        <span className="text-xs text-[var(--color-text-muted)]">Start:</span>
        {Object.entries(STARTERS).map(([key, s]) => (
          <button
            key={key}
            onClick={() => {
              updateState({ input: s.html })
              setLastAction(`Loaded "${s.label}" template`, 'info')
            }}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            {s.label}
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />

        {/* Rules toggle */}
        <button
          onClick={() => updateState({ showRules: !state.showRules })}
          className={`rounded border px-2 py-0.5 text-xs ${
            state.showRules
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          Rules
        </button>

        <CopyButton text={state.input} />

        {/* Status */}
        <div className="ml-auto flex items-center gap-2">
          {state.input.trim() && errors.length === 0 && (
            <span className="rounded bg-[var(--color-success)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
              ✓ Valid HTML
            </span>
          )}
          {errorCount > 0 && (
            <span className="rounded bg-[var(--color-error)] px-2 py-0.5 text-[10px] font-bold text-white">
              ✗ {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded bg-[var(--color-warning)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
              ⚠ {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs text-[var(--color-text-muted)]">
          <span>{stats.tags} tags</span>
          <span>depth {stats.depth}</span>
          {stats.inlineStyles > 0 && (
            <span className="text-[var(--color-warning)]">{stats.inlineStyles} inline style{stats.inlineStyles !== 1 ? 's' : ''}</span>
          )}
          {stats.inlineScripts > 0 && (
            <span className="text-[var(--color-warning)]">{stats.inlineScripts} script{stats.inlineScripts !== 1 ? 's' : ''}</span>
          )}
          {stats.headings.length > 0 && <span>{stats.headings.length} heading{stats.headings.length !== 1 ? 's' : ''}</span>}
        </div>
      )}

      {/* Rules panel */}
      {state.showRules && (
        <div className="max-h-40 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {RULE_CATEGORIES.map((cat) => (
              <div key={cat}>
                <div className="mb-1 text-[10px] font-bold uppercase text-[var(--color-text-muted)]">{cat}</div>
                {ALL_RULES.filter((r) => r.category === cat).map((rule) => {
                  const disabled = state.disabledRules.includes(rule.id)
                  return (
                    <label key={rule.id} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-xs">
                      <input
                        type="checkbox"
                        checked={!disabled}
                        onChange={() => toggleRule(rule.id)}
                        className="accent-[var(--color-accent)]"
                      />
                      <span className={disabled ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text)]'}>
                        {rule.label}
                      </span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="max-h-28 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {errors.map((e, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 py-0.5 text-xs ${
                e.type === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'
              }`}
            >
              <span className="shrink-0 rounded bg-[var(--color-surface-hover)] px-1 py-0 text-[10px] text-[var(--color-text-muted)]">
                L{e.line}:{e.col}
              </span>
              <span className="shrink-0 rounded border border-current px-1 py-0 text-[10px]">
                {e.rule}
              </span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Heading outline */}
      {stats && stats.headings.length > 0 && state.viewMode !== 'preview' && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1">
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">Outline:</span>
          {stats.headings.map((h, i) => (
            <span
              key={i}
              className="shrink-0 text-[10px] text-[var(--color-text)]"
              style={{ paddingLeft: (h.level - 1) * 8 }}
            >
              <span className="text-[var(--color-accent)]">h{h.level}</span> {h.text}
            </span>
          ))}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {showEditor && (
          <div className={`flex flex-col ${showPreview ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'}`}>
            <div className="flex-1">
              <Editor
                theme={monacoTheme}
                language="html"
                value={state.input}
                onChange={(v) => updateState({ input: v ?? '' })}
                options={EDITOR_OPTIONS}
              />
            </div>
          </div>
        )}
        {showPreview && (
          <div className={`flex flex-col ${showEditor ? 'w-1/2' : 'w-full'}`}>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
              Preview
            </div>
            <div className="flex-1 bg-white">
              {state.input.trim() ? (
                <iframe
                  title="HTML Preview"
                  sandbox=""
                  srcDoc={state.input}
                  className="h-full w-full border-none"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Enter HTML to see a live preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
