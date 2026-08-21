/**
 * Pure helpers for the HTML Validator — rule metadata, document statistics and
 * the heading outline. Kept out of the component so they can be unit-tested
 * without rendering Monaco.
 */

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type RuleCategory = 'structure' | 'attributes' | 'accessibility' | 'style'

export type RuleConfig = {
  id: string
  label: string
  /** Why the rule exists, shown as the row's title — the ids are cryptic. */
  hint: string
  category: RuleCategory
  /** On unless the user turns it off. Opinionated rules start off instead. */
  defaultEnabled: boolean
  /** What HTMLHint is given when the rule is on — a few rules take a mode. */
  value?: string | boolean
}

export const RULE_CATEGORIES: { id: RuleCategory; label: string }[] = [
  { id: 'structure', label: 'Structure' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'style', label: 'Style' },
]

/**
 * The rules offered in the panel.
 *
 * Every id here must exist in HTMLHint — `verify` silently ignores unknown
 * ones, so a typo would present a rule that can never fire.
 */
export const ALL_RULES: RuleConfig[] = [
  // Structure
  {
    id: 'tagname-lowercase',
    label: 'Tag names lowercase',
    hint: '<DIV> instead of <div>',
    category: 'structure',
    defaultEnabled: true,
  },
  {
    id: 'tag-pair',
    label: 'Tags are closed',
    hint: 'An unclosed or mismatched tag changes the whole document tree',
    category: 'structure',
    defaultEnabled: true,
  },
  {
    id: 'tagname-specialchars',
    label: 'No stray characters in tag names',
    hint: 'Usually a typo in a bracket',
    category: 'structure',
    defaultEnabled: true,
  },
  {
    id: 'spec-char-escape',
    label: 'Special characters escaped',
    hint: 'A bare < or > in text can swallow the rest of the markup',
    category: 'structure',
    defaultEnabled: true,
  },
  {
    id: 'tag-no-obsolete',
    label: 'No obsolete tags',
    hint: '<center>, <font> and friends were dropped in HTML5',
    category: 'structure',
    defaultEnabled: true,
  },
  {
    id: 'doctype-first',
    label: 'Doctype comes first',
    hint: 'Off by default: a fragment has no doctype',
    category: 'structure',
    defaultEnabled: false,
  },
  {
    id: 'doctype-html5',
    label: 'Doctype is HTML5',
    hint: 'Off by default: only meaningful for a full document',
    category: 'structure',
    defaultEnabled: false,
  },
  {
    id: 'tag-self-close',
    label: 'Void elements self-closed',
    hint: 'Off by default: <br /> is a style choice, not a rule',
    category: 'structure',
    defaultEnabled: false,
  },
  {
    id: 'empty-tag-not-self-closed',
    label: 'Empty elements not self-closed',
    hint: 'Off by default: the opposite convention to the rule above',
    category: 'structure',
    defaultEnabled: false,
  },

  // Attributes
  {
    id: 'attr-lowercase',
    label: 'Attribute names lowercase',
    hint: 'onClick instead of onclick',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'attr-value-double-quotes',
    label: 'Double quotes around values',
    hint: 'An unquoted value ends at the first space',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'attr-no-duplication',
    label: 'No duplicate attributes',
    hint: 'The second one is silently dropped',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'attr-unsafe-chars',
    label: 'No unsafe characters in values',
    hint: 'Control characters that will not survive a round trip',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'id-unique',
    label: 'IDs are unique',
    hint: 'A repeated id breaks label targets, anchors and querySelector',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'src-not-empty',
    label: 'src and href not empty',
    hint: 'An empty src re-requests the current page',
    category: 'attributes',
    defaultEnabled: true,
  },
  {
    id: 'attr-value-not-empty',
    label: 'No valueless attributes',
    hint: 'Off by default: `disabled` and `required` are legitimately bare',
    category: 'attributes',
    defaultEnabled: false,
  },
  {
    id: 'id-class-value',
    label: 'IDs and classes in dash-case',
    hint: 'Off by default: it rejects camelCase and BEM',
    category: 'attributes',
    defaultEnabled: false,
    value: 'dash',
  },

  // Accessibility
  {
    id: 'alt-require',
    label: 'Images have alt text',
    hint: 'Without it a screen reader announces the file name',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'title-require',
    label: 'Document has a title',
    hint: 'The title is the tab name and the first thing announced',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'html-lang-require',
    label: '<html> declares a language',
    hint: 'Screen readers pick a voice from it',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'input-requires-label',
    label: 'Inputs have labels',
    hint: 'A placeholder is not a label',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'button-type-require',
    label: 'Buttons declare a type',
    hint: 'A button in a form submits it unless told otherwise',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'frame-title-require',
    label: 'Frames have titles',
    hint: 'An untitled iframe is announced as "frame"',
    category: 'accessibility',
    defaultEnabled: true,
  },
  {
    id: 'h1-require',
    label: 'Page has an h1',
    hint: 'Off by default: a fragment often has none',
    category: 'accessibility',
    defaultEnabled: false,
  },
  {
    id: 'main-require',
    label: 'Page has a <main>',
    hint: 'Off by default: only meaningful for a full page',
    category: 'accessibility',
    defaultEnabled: false,
  },

  // Style
  {
    id: 'head-script-disabled',
    label: 'No scripts in <head>',
    hint: 'Off by default: render-blocking, but sometimes deliberate',
    category: 'style',
    defaultEnabled: false,
  },
  {
    id: 'inline-style-disabled',
    label: 'No inline style attributes',
    hint: 'Off by default',
    category: 'style',
    defaultEnabled: false,
  },
  {
    id: 'inline-script-disabled',
    label: 'No inline event handlers',
    hint: 'Off by default: onclick="…" cannot be covered by a CSP',
    category: 'style',
    defaultEnabled: false,
  },
  {
    id: 'meta-charset-require',
    label: 'Document declares a charset',
    hint: 'Off by default: only meaningful for a full document',
    category: 'style',
    defaultEnabled: false,
  },
  {
    id: 'meta-viewport-require',
    label: 'Document declares a viewport',
    hint: 'Off by default: only meaningful for a full document',
    category: 'style',
    defaultEnabled: false,
  },
]

export function ruleById(id: string): RuleConfig | undefined {
  return ALL_RULES.find((rule) => rule.id === id)
}

/**
 * Whether a rule is currently on.
 *
 * The two lists only ever hold departures from the defaults, so a rule the user
 * never touched follows the default even after the defaults change.
 */
export function isRuleEnabled(rule: RuleConfig, disabled: string[], enabled: string[]): boolean {
  if (disabled.includes(rule.id)) return false
  if (enabled.includes(rule.id)) return true
  return rule.defaultEnabled
}

/**
 * The ruleset handed to HTMLHint.
 *
 * Rules are listed only when they are on: the previous version passed
 * `false` for its three default-off rules, which read as "enabled" in the panel
 * while never being able to report anything.
 */
export function buildRuleset(disabled: string[], enabled: string[]): Record<string, unknown> {
  const ruleset: Record<string, unknown> = {}
  for (const rule of ALL_RULES) {
    if (isRuleEnabled(rule, disabled, enabled)) ruleset[rule.id] = rule.value ?? true
  }
  return ruleset
}

/** How many rules differ from the defaults — shown on the Rules button. */
export function countRuleOverrides(disabled: string[], enabled: string[]): number {
  return ALL_RULES.filter((rule) => isRuleEnabled(rule, disabled, enabled) !== rule.defaultEnabled)
    .length
}

/** Turning a rule on or off, expressed as the two override lists. */
export function toggleRule(
  rule: RuleConfig,
  disabled: string[],
  enabled: string[],
  next: boolean
): { disabledRules: string[]; enabledRules: string[] } {
  const withoutRule = {
    disabledRules: disabled.filter((id) => id !== rule.id),
    enabledRules: enabled.filter((id) => id !== rule.id),
  }
  if (next === rule.defaultEnabled) return withoutRule
  return next
    ? { ...withoutRule, enabledRules: [...withoutRule.enabledRules, rule.id] }
    : { ...withoutRule, disabledRules: [...withoutRule.disabledRules, rule.id] }
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export type HtmlIssue = {
  message: string
  line: number
  col: number
  type: 'error' | 'warning'
  rule: string
}

/** Errors first, then by position, so the worst problem is the one on screen. */
export function sortIssues(issues: HtmlIssue[]): HtmlIssue[] {
  const rank = (issue: HtmlIssue) => (issue.type === 'error' ? 0 : 1)
  return [...issues].sort(
    (a, b) => rank(a) - rank(b) || a.line - b.line || a.col - b.col || a.rule.localeCompare(b.rule)
  )
}

export function countIssues(issues: HtmlIssue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((issue) => issue.type === 'error').length,
    warnings: issues.filter((issue) => issue.type === 'warning').length,
  }
}

// ---------------------------------------------------------------------------
// Document statistics
// ---------------------------------------------------------------------------

export type Heading = { level: number; text: string; line?: number; column?: number }

export type HtmlStats = {
  elements: number
  depth: number
  styleAttributes: number
  scripts: number
  headings: Heading[]
}

const WRAPPER_TAGS = ['html', 'head', 'body'] as const

/**
 * Statistics read off the parsed document rather than off regexes.
 *
 * The old version counted `<tag` matches and tracked depth with a hand-rolled
 * stack, so `<li>` and `<p>` — which close themselves — pushed the reported
 * depth up with every sibling, and headings kept their raw entities (`&amp;`).
 *
 * `DOMParser` supplies `<html>`, `<head>` and `<body>` even for a fragment;
 * those are discounted so pasting a `<div>` does not report three elements
 * nobody wrote.
 */
export function computeStats(html: string): HtmlStats {
  // `window.DOMParser` rather than the bare global: the test environment builds
  // its DOM with jsdom and only exposes the constructor on `window`.
  const doc = new window.DOMParser().parseFromString(html, 'text/html')
  const implied = new Set(
    WRAPPER_TAGS.filter((tag) => !new RegExp(`<${tag}[\\s>]`, 'i').test(html))
  )

  const all = Array.from(doc.querySelectorAll('*'))
  let depth = 0
  let styleAttributes = 0
  for (const element of all) {
    if (element.hasAttribute('style')) styleAttributes += 1
    let level = 0
    let node: Element | null = element
    while (node) {
      if (!implied.has(node.tagName.toLowerCase() as (typeof WRAPPER_TAGS)[number])) level += 1
      node = node.parentElement
    }
    depth = Math.max(depth, level)
  }

  const headingLocations = Array.from(html.matchAll(/<h[1-6](?:\s[^>]*)?>/gi)).map((match) => {
    const offset = match.index ?? 0
    const before = html.slice(0, offset)
    const line = before.split('\n').length
    const lastBreak = before.lastIndexOf('\n')
    return { line, column: offset - lastBreak }
  })
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
    (heading, index) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      line: headingLocations[index]?.line ?? 1,
      column: headingLocations[index]?.column ?? 1,
    })
  )

  return {
    elements: all.length - implied.size,
    depth,
    styleAttributes,
    scripts: doc.querySelectorAll('script').length,
    headings,
  }
}

/**
 * Outline problems a linter will not catch.
 *
 * The old outline listed the headings and stopped there, which is the part a
 * developer can already see; the levels they skipped are the part they cannot.
 */
export type OutlineProblem = { message: string; headingIndex: number }

export function outlineProblemDetails(headings: Heading[]): OutlineProblem[] {
  if (headings.length === 0) return []
  const problems: OutlineProblem[] = []
  const first = headings[0]
  if (first && first.level !== 1) {
    problems.push({
      message: `The outline starts at h${first.level} — a page should open with its h1.`,
      headingIndex: 0,
    })
  }
  const h1Indexes = headings.flatMap((heading, index) => (heading.level === 1 ? [index] : []))
  const h1Count = h1Indexes.length
  if (h1Count > 1) {
    problems.push({
      message: `${h1Count} h1 headings — only one should name the page.`,
      headingIndex: h1Indexes[1] ?? 0,
    })
  }
  for (let i = 1; i < headings.length; i += 1) {
    const previous = headings[i - 1]
    const current = headings[i]
    if (previous && current && current.level - previous.level > 1) {
      problems.push({
        message: `h${previous.level} is followed by h${current.level} — the levels in between are missing.`,
        headingIndex: i,
      })
    }
  }
  return problems
}

export function outlineProblems(headings: Heading[]): string[] {
  return outlineProblemDetails(headings).map((problem) => problem.message)
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type HtmlTemplate = { id: string; label: string; html: string }

export const TEMPLATES: HtmlTemplate[] = [
  {
    id: 'minimal',
    label: 'Minimal page',
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page Title</title>
  </head>
  <body>
    <h1>Hello World</h1>
    <p>Start editing to see validation results.</p>
  </body>
</html>`,
  },
  {
    id: 'article',
    label: 'Article',
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
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
  {
    id: 'form',
    label: 'Accessible form',
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Contact Form</title>
  </head>
  <body>
    <h1>Contact Us</h1>
    <form action="/submit" method="post">
      <p>
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required />
      </p>
      <p>
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required />
      </p>
      <p>
        <label for="message">Message</label>
        <textarea id="message" name="message" rows="4"></textarea>
      </p>
      <button type="submit">Send</button>
    </form>
  </body>
</html>`,
  },
]

export function templateById(id: string): HtmlTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id)
}
