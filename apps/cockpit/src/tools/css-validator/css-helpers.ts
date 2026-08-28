/**
 * Everything the CSS Validator knows about CSS, kept out of the component so it
 * can be tested directly.
 *
 * Property and value checking is delegated to css-tree's lexer, which carries
 * the real specification. The previous version compared against a hand-written
 * list of ~150 property names, so every property added to CSS since that list
 * was typed — `inset`, `aspect-ratio`, `gap`, custom properties — was reported
 * as unknown.
 */

import * as cssTree from 'css-tree'

export type RuleCategory = 'syntax' | 'style' | 'compatibility'

export type RuleConfig = {
  id: string
  label: string
  hint: string
  category: RuleCategory
  severity: 'error' | 'warning'
  defaultEnabled: boolean
}

export const RULE_CATEGORIES: { id: RuleCategory; label: string }[] = [
  { id: 'syntax', label: 'Syntax' },
  { id: 'style', label: 'Style' },
  { id: 'compatibility', label: 'Compatibility' },
]

export const ALL_RULES: RuleConfig[] = [
  {
    id: 'syntax-errors',
    label: 'Syntax errors',
    hint: 'Declarations and blocks the parser could not read at all',
    category: 'syntax',
    severity: 'error',
    defaultEnabled: true,
  },
  {
    id: 'unknown-properties',
    label: 'Unknown properties',
    hint: 'Property names no specification defines, usually a typo',
    category: 'syntax',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'invalid-values',
    label: 'Invalid values',
    hint: 'Values that do not match the property grammar, like `padding: 3`',
    category: 'syntax',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'duplicate-properties',
    label: 'Duplicate properties',
    hint: 'The same property set twice in one rule — the second one wins',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'empty-rules',
    label: 'Empty rules',
    hint: 'A selector with no declarations ships bytes that do nothing',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'id-selectors',
    label: 'ID selectors',
    hint: 'IDs outrank every class, which makes later overrides harder',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'overqualified',
    label: 'Overqualified selectors',
    hint: 'Four or more compound parts is usually specificity nobody needs',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'important',
    label: '!important',
    hint: 'Wins over the cascade and can only be beaten by another !important',
    category: 'style',
    severity: 'warning',
    defaultEnabled: false,
  },
  {
    id: 'hex-length',
    label: 'Long hex colours',
    hint: '#ffffff can be written #fff',
    category: 'style',
    severity: 'warning',
    defaultEnabled: false,
  },
  {
    // Renamed from `zero-units`, which shipped with the opposite meaning: it
    // asked for a unit *on* zero. Keeping the id would have silently disabled
    // the corrected rule for anyone who had switched the old one off.
    id: 'redundant-zero-units',
    label: 'Units on zero',
    hint: '0px, 0em and 0% can all be written 0',
    category: 'style',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'deprecated',
    label: 'Deprecated properties',
    hint: 'Properties browsers keep only for old pages',
    category: 'compatibility',
    severity: 'warning',
    defaultEnabled: true,
  },
  {
    id: 'vendor-prefixes',
    label: 'Missing vendor prefixes',
    hint: 'Advice that has aged badly — off unless you support old engines',
    category: 'compatibility',
    severity: 'warning',
    defaultEnabled: false,
  },
]

export function ruleById(id: string): RuleConfig | undefined {
  return ALL_RULES.find((rule) => rule.id === id)
}

/**
 * State stores only departures from the defaults, so changing a default in a
 * later release still reaches people who never touched that rule.
 */
export function isRuleEnabled(rule: RuleConfig, disabled: string[], enabled: string[]): boolean {
  if (disabled.includes(rule.id)) return false
  if (enabled.includes(rule.id)) return true
  return rule.defaultEnabled
}

export function countRuleOverrides(disabled: string[], enabled: string[]): number {
  return ALL_RULES.filter((rule) => isRuleEnabled(rule, disabled, enabled) !== rule.defaultEnabled)
    .length
}

export function toggleRule(
  rule: RuleConfig,
  disabled: string[],
  enabled: string[],
  next: boolean
): { disabledRules: string[]; enabledRules: string[] } {
  const disabledRules = disabled.filter((id) => id !== rule.id)
  const enabledRules = enabled.filter((id) => id !== rule.id)
  if (next !== rule.defaultEnabled) {
    if (next) enabledRules.push(rule.id)
    else disabledRules.push(rule.id)
  }
  return { disabledRules, enabledRules }
}

export type CssIssue = {
  message: string
  line: number
  column: number
  type: 'error' | 'warning'
  rule: string
}

export type SelectorInfo = {
  text: string
  line: number
  column: number
  /** [ids, classes and attributes, elements] — the cascade's tie-breakers. */
  specificity: [number, number, number]
}

export type CssStats = {
  rules: number
  selectors: number
  declarations: number
  idSelectors: number
  importants: number
  customProperties: number
  atRules: number
  mediaQueries: number
}

const DEPRECATED_PROPERTIES = new Set([
  'zoom',
  'box-flex',
  'box-orient',
  'box-direction',
  'box-align',
  'box-pack',
  'flex-pack',
  'flex-align',
  'font-smoothing',
  'clip',
  'ime-mode',
  'scroll-snap-points-x',
  'scroll-snap-points-y',
])

const VENDOR_PREFIX_PROPERTIES = new Set([
  'appearance',
  'user-select',
  'background-clip',
  'text-size-adjust',
  'hyphens',
  'mask',
  'backdrop-filter',
])

/** `line-height: 0` and `flex-grow: 0` are counts, not lengths — no unit to drop. */
const ZERO_UNIT_PATTERN = /^0(px|em|rem|%|vh|vw|vmin|vmax|ex|ch|pt|pc|in|cm|mm|q)$/i

function isCustomProperty(property: string): boolean {
  return property.startsWith('--')
}

function isVendorPrefixed(property: string): boolean {
  return /^-[a-z]+-/.test(property)
}

function stripVendorPrefix(property: string): string {
  return property.replace(/^-(webkit|moz|ms|o)-/, '')
}

/** The property name resolved to nothing in the specification — usually a typo. */
function isSyntaxReferenceError(error: Error | null): error is cssTree.SyntaxReferenceError {
  return error?.name === 'SyntaxReferenceError'
}

/** The value did not match the property's grammar. */
function isSyntaxMatchError(error: Error | null): error is cssTree.SyntaxMatchError {
  return error?.name === 'SyntaxMatchError'
}

function locationOf(node: cssTree.CssNode): { line: number; column: number } {
  return { line: node.loc?.start.line ?? 1, column: node.loc?.start.column ?? 1 }
}

export type Specificity = [number, number, number]

const ZERO_SPECIFICITY: Specificity = [0, 0, 0]

function addSpecificity(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

/**
 * `:is()`, `:not()` and `:has()` take the specificity of their *most* specific
 * argument, and `:where()` contributes nothing at all. A plain walk that added
 * up everything it passed scored `:where(#id) .x` as though the id counted —
 * exactly the specificity the author wrote `:where()` to give away.
 */
const MATCHES_PSEUDOS = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'])

/** One selector token as it contributes to the displayed breakdown. */
export type SpecificityPart = { text: string; type: 'id' | 'class' | 'element' }

/** Score plus the tokens that produced it, so a breakdown can never contradict its own number. */
export type SpecificityDetail = { specificity: Specificity; parts: SpecificityPart[] }

function compareSpec(a: Specificity, b: Specificity): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * a-b-c per the selectors specification, together with the contributing tokens.
 *
 * Display parts come from this same recursion rather than a generic AST walk. A walk shows the
 * `#id` inside `:where(#id)` as an ID contribution and both branches of `:is(#a,.b)` even though
 * only the winning branch counts — a breakdown that disagrees with the score beside it.
 */
export function specificityDetailOf(node: cssTree.CssNode): SpecificityDetail {
  switch (node.type) {
    case 'SelectorList': {
      // A list is only ever scored as an argument, where the maximum wins.
      let best: SpecificityDetail = { specificity: ZERO_SPECIFICITY, parts: [] }
      let seen = false
      node.children.forEach((child: cssTree.CssNode) => {
        const detail = specificityDetailOf(child)
        if (!seen || compareSpec(detail.specificity, best.specificity) > 0) {
          best = detail
          seen = true
        }
      })
      return best
    }
    case 'Selector': {
      let total = ZERO_SPECIFICITY
      const parts: SpecificityPart[] = []
      node.children.forEach((child: cssTree.CssNode) => {
        const detail = specificityDetailOf(child)
        total = addSpecificity(total, detail.specificity)
        parts.push(...detail.parts)
      })
      return { specificity: total, parts }
    }
    case 'IdSelector':
      return { specificity: [1, 0, 0], parts: [{ text: `#${node.name}`, type: 'id' }] }
    case 'ClassSelector':
      return { specificity: [0, 1, 0], parts: [{ text: `.${node.name}`, type: 'class' }] }
    case 'AttributeSelector':
      return { specificity: [0, 1, 0], parts: [{ text: cssTree.generate(node), type: 'class' }] }
    case 'PseudoElementSelector':
      return { specificity: [0, 0, 1], parts: [{ text: `::${node.name}`, type: 'element' }] }
    case 'TypeSelector':
      // The universal selector matches everything and so decides nothing.
      return node.name === '*' || node.name.endsWith('|*')
        ? { specificity: ZERO_SPECIFICITY, parts: [] }
        : { specificity: [0, 0, 1], parts: [{ text: node.name, type: 'element' }] }
    case 'PseudoClassSelector': {
      if (node.name === 'where') return { specificity: ZERO_SPECIFICITY, parts: [] }
      let inner: SpecificityDetail = { specificity: ZERO_SPECIFICITY, parts: [] }
      node.children?.forEach((child: cssTree.CssNode) => {
        // `:nth-child(2 of .a)` keeps its selector inside the Nth node.
        if (child.type === 'Nth' && child.selector) inner = specificityDetailOf(child.selector)
        else if (child.type === 'SelectorList') inner = specificityDetailOf(child)
      })
      if (MATCHES_PSEUDOS.has(node.name)) return inner
      return {
        specificity: addSpecificity([0, 1, 0], inner.specificity),
        parts: [{ text: `:${node.name}`, type: 'class' }, ...inner.parts],
      }
    }
    default:
      return { specificity: ZERO_SPECIFICITY, parts: [] }
  }
}

/** a-b-c per the selectors specification. */
export function specificityOf(node: cssTree.CssNode): Specificity {
  return specificityDetailOf(node).specificity
}

/**
 * How many compound parts a selector chains together — `.a.b` is one level and
 * `.a > .b .c` is three. Counted from the top-level combinators only, so a
 * combinator nested inside `:is(.a .b)` does not inflate the total.
 */
export function depthOf(node: cssTree.CssNode): number {
  if (node.type !== 'Selector') return 1
  let combinators = 0
  node.children.forEach((child: cssTree.CssNode) => {
    if (child.type === 'Combinator') combinators += 1
  })
  return combinators + 1
}

export function compareSpecificity(a: SelectorInfo, b: SelectorInfo): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (b.specificity[index] ?? 0) - (a.specificity[index] ?? 0)
    if (difference !== 0) return difference
  }
  return a.line - b.line
}

export type CssAnalysis = {
  issues: CssIssue[]
  stats: CssStats
  selectors: SelectorInfo[]
}

/**
 * One pass produces problems, statistics and the selector list. The previous
 * version ran the whole analysis twice — once debounced for problems and again
 * on every keystroke for the statistics line, discarding its issues.
 */
export function analyzeCss(css: string, disabled: string[], enabled: string[]): CssAnalysis {
  const issues: CssIssue[] = []
  const selectors: SelectorInfo[] = []
  const stats: CssStats = {
    rules: 0,
    selectors: 0,
    declarations: 0,
    idSelectors: 0,
    importants: 0,
    customProperties: 0,
    atRules: 0,
    mediaQueries: 0,
  }

  const on = (id: string) => {
    const rule = ruleById(id)
    return rule ? isRuleEnabled(rule, disabled, enabled) : false
  }
  const reportSyntax = on('syntax-errors')

  let ast: cssTree.CssNode
  try {
    ast = cssTree.parse(css, {
      positions: true,
      onParseError(error: cssTree.SyntaxParseError & { line?: number; column?: number }) {
        if (!reportSyntax) return
        issues.push({
          message: error.rawMessage ?? error.message,
          line: error.line ?? 1,
          column: error.column ?? 1,
          type: 'error',
          rule: 'syntax-errors',
        })
      },
    })
  } catch (error) {
    // css-tree recovers from almost everything, so reaching here means the
    // input is not CSS at all rather than CSS with a mistake in it.
    if (reportSyntax) {
      issues.push({
        message: error instanceof Error ? error.message : 'Could not parse this stylesheet',
        line: 1,
        column: 1,
        type: 'error',
        rule: 'syntax-errors',
      })
    }
    return { issues, stats, selectors }
  }

  cssTree.walk(ast, {
    enter(node: cssTree.CssNode) {
      if (node.type === 'Atrule') {
        stats.atRules += 1
        if (node.name === 'media') stats.mediaQueries += 1
      }
      if (node.type !== 'Rule') return

      stats.rules += 1
      const ruleLocation = locationOf(node)

      const declarations: cssTree.Declaration[] = []
      node.block.children.forEach((child: cssTree.CssNode) => {
        if (child.type === 'Declaration') declarations.push(child)
      })
      stats.declarations += declarations.length

      if (on('empty-rules') && declarations.length === 0) {
        issues.push({
          message: 'This rule has no declarations.',
          line: ruleLocation.line,
          column: ruleLocation.column,
          type: 'warning',
          rule: 'empty-rules',
        })
      }

      if (node.prelude.type === 'SelectorList') {
        node.prelude.children.forEach((selector: cssTree.CssNode) => {
          const text = cssTree.generate(selector).trim()
          const specificity = specificityOf(selector)
          const location = locationOf(selector)
          stats.selectors += 1
          // One selector using two IDs is still one ID selector; the footer
          // counts selectors, not the IDs inside them.
          if (specificity[0] > 0) stats.idSelectors += 1
          selectors.push({ text, line: location.line, column: location.column, specificity })

          if (on('id-selectors') && specificity[0] > 0) {
            issues.push({
              message: `Selector "${text}" uses an ID.`,
              line: location.line,
              column: location.column,
              type: 'warning',
              rule: 'id-selectors',
            })
          }

          // Depth from the parse tree rather than the text: a combinator inside
          // `:is(.a .b)` belongs to the argument, not to this selector, so
          // splitting the generated string would overcount it.
          const depth = depthOf(selector)
          if (on('overqualified') && depth >= 4) {
            issues.push({
              message: `Selector "${text}" is ${depth} levels deep.`,
              line: location.line,
              column: location.column,
              type: 'warning',
              rule: 'overqualified',
            })
          }
        })
      }

      const seen = new Map<string, number>()
      for (const declaration of declarations) {
        const property = declaration.property.toLowerCase()
        const normalized = stripVendorPrefix(property)
        const location = locationOf(declaration)
        const custom = isCustomProperty(property)
        if (custom) stats.customProperties += 1
        if (declaration.important) stats.importants += 1

        const previous = seen.get(property)
        if (on('duplicate-properties') && previous !== undefined) {
          issues.push({
            message: `"${property}" is already set on line ${previous} of this rule.`,
            line: location.line,
            column: location.column,
            type: 'warning',
            rule: 'duplicate-properties',
          })
        }
        seen.set(property, location.line)

        if (on('important') && declaration.important) {
          issues.push({
            message: `"${property}" is marked !important.`,
            line: location.line,
            column: location.column,
            type: 'warning',
            rule: 'important',
          })
        }

        // Custom properties accept anything by design, and a prefixed property
        // is a deliberate departure from the specification rather than a typo.
        if (
          !custom &&
          !isVendorPrefixed(property) &&
          (on('unknown-properties') || on('invalid-values'))
        ) {
          const { error } = cssTree.lexer.matchProperty(property, declaration.value)
          // The two error classes are typed but not exported at runtime, so the
          // name is the only way to tell them apart. Any other error — a var()
          // the lexer cannot resolve, a property it has no grammar for — is a
          // limit of the checker, not a mistake.
          if (isSyntaxReferenceError(error) && on('unknown-properties')) {
            issues.push({
              message: `Unknown property "${property}".`,
              line: location.line,
              column: location.column,
              type: 'warning',
              rule: 'unknown-properties',
            })
          } else if (isSyntaxMatchError(error) && on('invalid-values')) {
            issues.push({
              message: `"${cssTree.generate(declaration.value)}" is not a valid value for "${property}".`,
              line: error.loc?.start.line ?? location.line,
              column: error.loc?.start.column ?? location.column,
              type: 'warning',
              rule: 'invalid-values',
            })
          }
        }

        if (on('deprecated') && DEPRECATED_PROPERTIES.has(normalized)) {
          issues.push({
            message: `"${property}" is deprecated.`,
            line: location.line,
            column: location.column,
            type: 'warning',
            rule: 'deprecated',
          })
        }

        if (
          on('vendor-prefixes') &&
          VENDOR_PREFIX_PROPERTIES.has(normalized) &&
          !isVendorPrefixed(property)
        ) {
          issues.push({
            message: `"${property}" may still need a -webkit- prefix.`,
            line: location.line,
            column: location.column,
            type: 'warning',
            rule: 'vendor-prefixes',
          })
        }

        if (on('redundant-zero-units') || on('hex-length')) {
          cssTree.walk(declaration.value, {
            enter(valueNode: cssTree.CssNode) {
              // The old rule had this backwards: it asked for a unit *on* zero,
              // so idiomatic `margin: 0` was reported and `0px` was not.
              if (on('redundant-zero-units') && valueNode.type === 'Dimension') {
                const raw = `${valueNode.value}${valueNode.unit}`
                if (ZERO_UNIT_PATTERN.test(raw)) {
                  const zeroLocation = locationOf(valueNode)
                  issues.push({
                    message: `"${raw}" can be written "0".`,
                    line: zeroLocation.line,
                    column: zeroLocation.column,
                    type: 'warning',
                    rule: 'redundant-zero-units',
                  })
                }
              }
              if (
                on('redundant-zero-units') &&
                valueNode.type === 'Percentage' &&
                valueNode.value === '0'
              ) {
                const zeroLocation = locationOf(valueNode)
                issues.push({
                  message: '"0%" can be written "0".',
                  line: zeroLocation.line,
                  column: zeroLocation.column,
                  type: 'warning',
                  rule: 'redundant-zero-units',
                })
              }
              if (on('hex-length') && valueNode.type === 'Hash') {
                const hex = valueNode.value.toLowerCase()
                if (
                  /^[0-9a-f]{6}$/.test(hex) &&
                  hex[0] === hex[1] &&
                  hex[2] === hex[3] &&
                  hex[4] === hex[5]
                ) {
                  const hexLocation = locationOf(valueNode)
                  issues.push({
                    message: `"#${hex}" can be written "#${hex[0]}${hex[2]}${hex[4]}".`,
                    line: hexLocation.line,
                    column: hexLocation.column,
                    type: 'warning',
                    rule: 'hex-length',
                  })
                }
              }
            },
          })
        }
      }
    },
  })

  return { issues: sortIssues(issues), stats, selectors }
}

/** Errors first, then document order: the first row is the one to fix. */
export function sortIssues(issues: CssIssue[]): CssIssue[] {
  return [...issues].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'error' ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (a.column !== b.column) return a.column - b.column
    return a.rule.localeCompare(b.rule)
  })
}

export function countIssues(issues: CssIssue[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const issue of issues) {
    if (issue.type === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings }
}

export type CssTemplate = { id: string; label: string; css: string }

export const TEMPLATES: CssTemplate[] = [
  {
    id: 'flexbox',
    label: 'Flexbox layout',
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
}
`,
  },
  {
    id: 'grid',
    label: 'Responsive grid',
    css: `.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
  padding: 2rem;
}

.grid-item {
  border-radius: 8px;
  background: #f9fafb;
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
  padding: 1.5rem;
}
`,
  },
  {
    id: 'tokens',
    label: 'Design tokens',
    css: `:root {
  --color-bg: #101014;
  --color-text: #e8e8ea;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --radius: 6px;
}

.card {
  background: var(--color-bg);
  color: var(--color-text);
  padding: var(--space-md);
  border-radius: var(--radius);
}
`,
  },
]

export function templateById(id: string): CssTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id)
}
