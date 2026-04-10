import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import * as cssTree from 'css-tree'
import { useFormatter } from '@/hooks/useFormatter'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type CssValidatorState = {
  input: string
  showRules: boolean
  disabledRules: string[]
}

type CssIssue = {
  message: string
  line: number
  column: number
  type: 'error' | 'warning'
  rule: string
}

type RuleConfig = {
  id: string
  label: string
  severity: 'error' | 'warning'
  category: 'syntax' | 'style' | 'compatibility'
  defaultEnabled: boolean
  description: string
}

type CssStats = {
  rules: number
  selectors: number
  declarations: number
  idSelectors: number
}

const LINT_RULES: RuleConfig[] = [
  {
    id: 'duplicate-properties',
    label: 'Duplicate properties',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Detect duplicate CSS properties in the same rule.',
  },
  {
    id: 'unknown-properties',
    label: 'Unknown properties',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Flag CSS properties that are likely invalid or misspelled.',
  },
  {
    id: 'zero-units',
    label: 'Zero units',
    category: 'compatibility',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Warn when zero values are used without required units.',
  },
  {
    id: 'vendor-prefixes',
    label: 'Vendor prefixes',
    category: 'compatibility',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Suggest legacy vendor prefixes for known properties.',
  },
  {
    id: 'deprecated',
    label: 'Deprecated properties',
    category: 'compatibility',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Warn about deprecated CSS properties.',
  },
  {
    id: 'id-selectors',
    label: 'ID selectors',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Warn when using ID selectors instead of classes.',
  },
  {
    id: 'overqualified',
    label: 'Overqualified selectors',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Flag selectors with too many levels of specificity.',
  },
  {
    id: 'hex-length',
    label: 'Hex length',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Suggest shortening 6-digit hex colors to 3-digit when possible.',
  },
  {
    id: 'empty-rules',
    label: 'Empty rules',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
    description: 'Warn about CSS rules with no declarations.',
  },
]

const RULE_CATEGORIES: Array<RuleConfig['category']> = ['syntax', 'style', 'compatibility']

const VENDOR_PREFIX_PROPERTIES = new Set([
  'appearance',
  'user-select',
  'transform',
  'box-shadow',
  'animation',
  'transition',
  'background-clip',
  'text-size-adjust',
  'hyphens',
])

const DEPRECATED_PROPERTIES = new Set([
  'zoom',
  'box-flex',
  'box-orient',
  'box-direction',
  'flex-pack',
  'flex-align',
  'font-smoothing',
])

const LENGTH_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'top',
  'right',
  'bottom',
  'left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'border-radius',
  'border-width',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'outline-width',
  'letter-spacing',
  'line-height',
  'font-size',
  'text-indent',
  'column-gap',
])

const KNOWN_PROPERTIES = new Set([
  'align-items',
  'align-content',
  'align-self',
  'animation',
  'animation-delay',
  'animation-direction',
  'animation-duration',
  'animation-fill-mode',
  'animation-iteration-count',
  'animation-name',
  'animation-timing-function',
  'appearance',
  'background',
  'background-attachment',
  'background-clip',
  'background-color',
  'background-image',
  'background-origin',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-bottom-style',
  'border-bottom-width',
  'border-collapse',
  'border-color',
  'border-image',
  'border-image-outset',
  'border-image-repeat',
  'border-image-slice',
  'border-image-source',
  'border-image-width',
  'border-left',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-radius',
  'border-right',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-spacing',
  'border-style',
  'border-top',
  'border-top-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-top-style',
  'border-top-width',
  'border-width',
  'bottom',
  'box-shadow',
  'box-sizing',
  'color',
  'column-count',
  'column-gap',
  'column-rule',
  'column-rule-color',
  'column-rule-style',
  'column-rule-width',
  'column-span',
  'display',
  'filter',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-flow',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'float',
  'font',
  'font-family',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'grid',
  'grid-area',
  'grid-auto-columns',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-column',
  'grid-column-end',
  'grid-column-gap',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-gap',
  'grid-row-start',
  'grid-template',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'height',
  'justify-content',
  'left',
  'letter-spacing',
  'line-height',
  'list-style',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'opacity',
  'order',
  'outline',
  'outline-color',
  'outline-offset',
  'outline-style',
  'outline-width',
  'overflow',
  'overflow-x',
  'overflow-y',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'text-align',
  'text-decoration',
  'text-indent',
  'text-overflow',
  'text-shadow',
  'text-transform',
  'top',
  'transform',
  'transition',
  'transition-delay',
  'transition-duration',
  'transition-property',
  'transition-timing-function',
  'vertical-align',
  'visibility',
  'white-space',
  'width',
  'word-break',
  'word-spacing',
  'word-wrap',
  'z-index',
])

const SAMPLES: { label: string; css: string }[] = [
  {
    label: 'Flexbox Layout',
    css: `.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 100vh;
}

.container > .item {
  flex: 1 1 auto;
  padding: 1rem 2rem;
}`,
  },
  {
    label: 'CSS Grid',
    css: `.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  grid-template-rows: auto 1fr auto;
  gap: 1.5rem;
  padding: 2rem;
}

.grid-item {
  border-radius: 8px;
  background: #f9fafb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}`,
  },
  {
    label: 'Lint Demo',
    css: `/* Lint Demo */
#page .container .item {
  width: 0;
  display: flex;
  display: inline-flex;
  appearance: none;
  zoom: 1;
  color: #ffffff;
}

.empty-rule {}

nav#main-nav > .link.active .label {
  margin-top: 0;
  padding: 0px 1rem;
  box-shadow: 0 0 0 #000;
}`,
  },
]

function isRuleEnabled(ruleId: string, disabledRules: string[]) {
  return !disabledRules.includes(ruleId)
}

function stripVendorPrefix(property: string) {
  return property.replace(/^-(webkit|moz|ms|o)-/, '')
}

function isVendorPrefixed(property: string) {
  return /^-[a-z]+-/.test(property)
}

type MonacoEditorInstance = Parameters<OnMount>[0]

function getTokenLocation(node: { loc?: cssTree.CssLocation | null | undefined }) {
  return {
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
  }
}

function formatCssString(css: string) {
  const compact = css
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*{\s*/g, ' {\n')
    .replace(/\s*}\s*/g, '\n}\n')
    .replace(/\s*;\s*/g, ';\n')
    .replace(/\s*,\s*/g, ', ')
    .trim()

  const lines = compact
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let indent = 0
  let output = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('}')) {
      indent = Math.max(indent - 1, 0)
    }

    output += `${'  '.repeat(indent)}${trimmed}\n`

    if (trimmed.endsWith('{')) {
      indent += 1
    }
  }

  return output
}

function analyzeCss(css: string, disabledRules: string[]) {
  const issues: CssIssue[] = []
  const stats: CssStats = { rules: 0, selectors: 0, declarations: 0, idSelectors: 0 }

  const onParseError = (error: cssTree.SyntaxParseError & { line?: number; column?: number }) => {
    issues.push({
      message: error.message,
      line: error.line ?? 0,
      column: error.column ?? 0,
      type: 'error',
      rule: 'syntax',
    })
  }

  let ast: cssTree.CssNode | null = null
  try {
    ast = cssTree.parse(css, { positions: true, onParseError })
  } catch (error) {
    const err = error as Error
    issues.push({
      message: err.message,
      line: 1,
      column: 1,
      type: 'error',
      rule: 'syntax',
    })
  }

  if (!ast || ast.type !== 'StyleSheet') {
    return { issues, stats: null }
  }

  cssTree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      const ruleLoc = getTokenLocation(node)
      stats.rules += 1

      const selectorText = cssTree.generate(node.prelude)
      const selectorCount = selectorText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean).length
      stats.selectors += selectorCount

      const declarations: cssTree.Declaration[] = []
      if (node.block && node.block.children) {
        node.block.children.forEach((child) => {
          if (child.type === 'Declaration') {
            declarations.push(child)
          }
        })
      }

      stats.declarations += declarations.length

      if (isRuleEnabled('empty-rules', disabledRules) && declarations.length === 0) {
        issues.push({
          message: 'Rule contains no declarations.',
          line: ruleLoc.line,
          column: ruleLoc.column,
          type: 'warning',
          rule: 'empty-rules',
        })
      }

      const propertyMap = new Map<string, cssTree.Declaration[]>()
      for (const declaration of declarations) {
        const property = declaration.property.toLowerCase()
        const normalized = stripVendorPrefix(property)
        const declLoc = getTokenLocation(declaration)

        if (!propertyMap.has(property)) {
          propertyMap.set(property, [])
        }
        propertyMap.get(property)?.push(declaration)

        if (
          isRuleEnabled('unknown-properties', disabledRules) &&
          !KNOWN_PROPERTIES.has(normalized) &&
          !isVendorPrefixed(property)
        ) {
          issues.push({
            message: `Unknown CSS property "${property}".`,
            line: declLoc.line,
            column: declLoc.column,
            type: 'warning',
            rule: 'unknown-properties',
          })
        }

        if (isRuleEnabled('deprecated', disabledRules) && DEPRECATED_PROPERTIES.has(normalized)) {
          issues.push({
            message: `Deprecated CSS property "${property}".`,
            line: declLoc.line,
            column: declLoc.column,
            type: 'warning',
            rule: 'deprecated',
          })
        }

        if (
          isRuleEnabled('vendor-prefixes', disabledRules) &&
          VENDOR_PREFIX_PROPERTIES.has(normalized) &&
          !isVendorPrefixed(property)
        ) {
          issues.push({
            message: `Consider adding vendor-prefixed versions for "${property}".`,
            line: declLoc.line,
            column: declLoc.column,
            type: 'warning',
            rule: 'vendor-prefixes',
          })
        }

        if (isRuleEnabled('zero-units', disabledRules) && LENGTH_PROPERTIES.has(normalized)) {
          cssTree.walk(declaration.value, {
            visit: 'Number',
            enter(node) {
              if (node.value === '0') {
                const nodeLoc = getTokenLocation(node)
                issues.push({
                  message: `Use a length unit for zero values in "${property}".`,
                  line: nodeLoc.line,
                  column: nodeLoc.column,
                  type: 'warning',
                  rule: 'zero-units',
                })
              }
            },
          })
        }

        cssTree.walk(declaration.value, {
          visit: 'Hash',
          enter(node) {
            const raw = `#${node.value}`.toLowerCase()
            if (
              isRuleEnabled('hex-length', disabledRules) &&
              /^#[0-9a-f]{6}$/.test(raw) &&
              raw[1] === raw[2] &&
              raw[3] === raw[4] &&
              raw[5] === raw[6]
            ) {
              const nodeLoc = getTokenLocation(node)
              issues.push({
                message: `Use shorthand hex color "#${raw[1]}${raw[3]}${raw[5]}".`,
                line: nodeLoc.line,
                column: nodeLoc.column,
                type: 'warning',
                rule: 'hex-length',
              })
            }
          },
        })
      }

      if (isRuleEnabled('duplicate-properties', disabledRules)) {
        propertyMap.forEach((decls, property) => {
          if (decls.length > 1) {
            decls.slice(1).forEach((duplicate) => {
              const dupLoc = getTokenLocation(duplicate)
              issues.push({
                message: `Duplicate property "${property}" in the same rule.`,
                line: dupLoc.line,
                column: dupLoc.column,
                type: 'warning',
                rule: 'duplicate-properties',
              })
            })
          }
        })
      }

      if (isRuleEnabled('id-selectors', disabledRules)) {
        cssTree.walk(node.prelude, {
          visit: 'IdSelector',
          enter(idNode) {
            const idLoc = getTokenLocation(idNode)
            issues.push({
              message: `Avoid ID selectors like "#${idNode.name}".`,
              line: idLoc.line,
              column: idLoc.column,
              type: 'warning',
              rule: 'id-selectors',
            })
            stats.idSelectors += 1
          },
        })
      }

      if (isRuleEnabled('overqualified', disabledRules) && node.prelude.type === 'SelectorList') {
        node.prelude.children.forEach((selector) => {
          const selectorText = cssTree.generate(selector).trim()
          const selectorParts = selectorText.split(/\s*[>+~\s]\s*/).filter(Boolean)
          if (selectorParts.length >= 3) {
            const selectorLoc = getTokenLocation(selector)
            issues.push({
              message: `Selector is overqualified: "${selectorText}".`,
              line: selectorLoc.line,
              column: selectorLoc.column,
              type: 'warning',
              rule: 'overqualified',
            })
          }
        })
      }
    },
  })

  return { issues, stats }
}

function computeCssStats(css: string): CssStats | null {
  const { stats } = analyzeCss(css, [])
  return stats
}

export default function CssValidator() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<CssValidatorState>('css-validator', {
    input: '',
    showRules: false,
    disabledRules: [],
  })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [issues, setIssues] = useState<CssIssue[]>([])
  const [isFormatting, setIsFormatting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<MonacoEditorInstance | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  const formatter = useFormatter()

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
  }, [])

  const handleFormat = useCallback(async () => {
    if (!state.input.trim() || isFormatting) return
    setIsFormatting(true)
    try {
      let formatted = state.input
      try {
        formatted = await formatter.format(state.input, {
          language: 'css',
          tabWidth: monacoOptions.tabSize ?? 2,
          useTabs: false,
          singleQuote: true,
          trailingComma: 'es5',
          semi: false,
        })
      } catch {
        formatted = formatCssString(state.input)
      }

      if (!formatted.trim() || formatted.trim() === state.input.trim()) {
        formatted = formatCssString(state.input)
      }

      updateState({ input: formatted })
      setLastAction('Formatted CSS', 'success')
    } catch (error) {
      setLastAction((error as Error).message || 'Format failed', 'error')
    } finally {
      setIsFormatting(false)
    }
  }, [formatter, isFormatting, monacoOptions.tabSize, state.input, updateState, setLastAction])

  useEffect(() => {
    if (!state.input.trim()) {
      setIssues([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const { issues: nextIssues } = analyzeCss(state.input, state.disabledRules)
      setIssues(nextIssues)
      const errorCount = nextIssues.filter((issue) => issue.type === 'error').length
      const warnCount = nextIssues.filter((issue) => issue.type === 'warning').length
      if (nextIssues.length === 0) {
        setLastAction('Valid CSS', 'success')
      } else {
        const level = errorCount > 0 ? 'error' : 'info'
        setLastAction(`${errorCount} error(s), ${warnCount} warning(s)`, level)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, state.disabledRules, setLastAction])

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return

    const monaco = monacoRef.current
    const decorations = issues.map((issue) => {
      const startColumn = issue.column > 0 ? issue.column + 1 : 1
      const endColumn = startColumn + 1
      return {
        range: new monaco.Range(issue.line, startColumn, issue.line, endColumn),
        options: {
          isWholeLine: true,
          linesDecorationsClassName:
            issue.type === 'error' ? 'css-error-line-gutter' : 'css-warning-line-gutter',
          inlineClassName: issue.type === 'error' ? 'css-error-inline' : 'css-warning-inline',
          hoverMessage: { value: issue.message },
        },
      }
    })

    decorationIdsRef.current = editorRef.current.deltaDecorations(
      decorationIdsRef.current,
      decorations
    )
  }, [issues])

  const stats = useMemo(() => {
    if (!state.input.trim()) return null
    return computeCssStats(state.input)
  }, [state.input])

  const errorCount = issues.filter((issue) => issue.type === 'error').length
  const warnCount = issues.filter((issue) => issue.type === 'warning').length

  const toggleRule = useCallback(
    (ruleId: string) => {
      const disabled = state.disabledRules.includes(ruleId)
        ? state.disabledRules.filter((rule) => rule !== ruleId)
        : [...state.disabledRules, ruleId]
      updateState({ disabledRules: disabled })
    },
    [state.disabledRules, updateState]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="text-xs text-[var(--color-text-muted)]">Lint:</span>
        <Button
          variant={state.showRules ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => updateState({ showRules: !state.showRules })}
          className="text-[10px]"
        >
          Rules
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFormat}
          disabled={isFormatting || !state.input.trim()}
          className="text-[10px]"
        >
          {isFormatting ? 'Formatting…' : 'Format'}
        </Button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />

        {SAMPLES.map((sample) => (
          <button
            key={sample.label}
            onClick={() => {
              updateState({ input: sample.css })
              setLastAction(`Loaded "${sample.label}" sample`, 'info')
            }}
            className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            {sample.label}
          </button>
        ))}

        <CopyButton text={state.input} />

        <div className="ml-auto flex items-center gap-2">
          {state.input.trim() && errorCount === 0 && warnCount === 0 && (
            <span className="rounded bg-[var(--color-success)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-bg)]">
              ✓ Valid CSS
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

      {stats && (
        <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1 text-xs text-[var(--color-text-muted)]">
          <span>
            {stats.rules} rule{stats.rules !== 1 ? 's' : ''}
          </span>
          <span>
            {stats.selectors} selector{stats.selectors !== 1 ? 's' : ''}
          </span>
          <span>
            {stats.declarations} declaration{stats.declarations !== 1 ? 's' : ''}
          </span>
          {stats.idSelectors > 0 && (
            <span className="text-[var(--color-warning)]">
              {stats.idSelectors} ID selector{stats.idSelectors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {state.showRules && (
        <div className="max-h-48 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_CATEGORIES.map((category) => (
              <div key={category}>
                <div className="mb-1 text-[10px] font-bold uppercase text-[var(--color-text-muted)]">
                  {category}
                </div>
                {LINT_RULES.filter((rule) => rule.category === category).map((rule) => {
                  const disabled = state.disabledRules.includes(rule.id)
                  return (
                    <label
                      key={rule.id}
                      className="flex cursor-pointer items-center gap-2 py-0.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={!disabled}
                        onChange={() => toggleRule(rule.id)}
                        className="accent-[var(--color-accent)]"
                      />
                      <div>
                        <div
                          className={
                            disabled
                              ? 'text-[var(--color-text-muted)] line-through'
                              : 'text-[var(--color-text)]'
                          }
                        >
                          {rule.label}
                        </div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          {rule.description}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="max-h-36 overflow-auto border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.rule}-${index}`}
              className={`flex flex-wrap items-start gap-2 py-1 text-xs ${
                issue.type === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'
              }`}
            >
              <span className="shrink-0 rounded bg-[var(--color-surface-hover)] px-1 py-0 text-[10px] text-[var(--color-text-muted)]">
                L{issue.line}:C{issue.column}
              </span>
              <span className="shrink-0 rounded border border-current px-1 py-0 text-[10px]">
                {issue.rule}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Editor
          theme={monacoTheme}
          language="css"
          value={state.input}
          onChange={(v) => updateState({ input: v ?? '' })}
          options={monacoOptions}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  )
}
