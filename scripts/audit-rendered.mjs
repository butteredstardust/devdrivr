#!/usr/bin/env bun
/**
 * Rendered invariant audit.
 *
 * PREREQUISITES:
 * - The browser harness must already be running on `AUDIT_URL` (`bun run dev`). The run stops with
 *   an explanation rather than a stack trace when it is not.
 * - Chromium must be installed for `playwright-core`: `npx playwright install chromium`. The
 *   browser is pinned per playwright version, so a version bump needs this again. `bun run
 *   screenshots` fails the same way for the same reason.
 *
 * Opens every tool in the registry and asserts a small set of invariants against the real DOM and
 * the resolved styles. It reports; it does not gate, unless `--gate` is passed.
 *
 * Why this renders rather than reads the source. `lint-design-system.mjs` proves a rule about what
 * source text *contains*: a hardcoded colour is a literal however the class is assembled. The rules
 * here are the opposite shape — they ask what a control *lacks*. Absence survives any indirection.
 * A focus ring reached through a shared constant, a `cn()` call or a variant map is invisible to a
 * text scan, and a measurement across the 67 raw buttons in `src/` returned 47 findings of which
 * zero were real. The resolved DOM has no indirection left to hide in.
 *
 * Why it is one tool per page load. A backgrounded tool stays mounted (see `Workspace.tsx`), so a
 * shared page carries every previously opened tool's controls. `hidden` is `display:none`, which
 * drops those from the tab order but not from `querySelectorAll`. One load per tool keeps a finding
 * attributable to the tool named beside it.
 *
 * Scope. Each tool run inspects that tool's panel. The shell chrome around it — sidebar, title bar,
 * tab strip — is audited once, under the name `shell`, because it does not change per tool.
 *
 * False positives. Add an entry to `ALLOWLIST` with a reason. A rule that reports a deliberate
 * choice teaches people to ignore the whole run.
 *
 * Usage:
 *   bun scripts/audit-rendered.mjs                 report every tool, exit 0
 *   bun scripts/audit-rendered.mjs --gate          exit 1 when a finding survives
 *   bun scripts/audit-rendered.mjs --only image    limit to tools matching a substring
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import ts from 'typescript'

const ROOT = new URL('..', import.meta.url).pathname
const REGISTRY = join(ROOT, 'src/app/tool-registry.ts')
const URL_BASE = process.env.AUDIT_URL ?? 'http://localhost:1420'

/**
 * Findings that are deliberate. Keyed by `rule`, each entry matches when its `match` substring is
 * in the finding's element description. The reason is mandatory and is printed in the summary, so a
 * silent allowlist cannot accumulate.
 */
const ALLOWLIST = []

/** Viewport wide enough that toolbars render inline rather than folding into an overflow menu. */
const VIEWPORT = { width: 1400, height: 900 }

/** Upper bound on Tab presses per tool. A tool with more stops than this reports the truncation. */
const MAX_TAB_STOPS = 80

// ─── Registry ───────────────────────────────────────────────────────

/**
 * Tool display names, read from a parse rather than a regex.
 *
 * The name is what the sidebar button is labelled with, so it is also how this opens the tool.
 */
function readToolNames() {
  const source = ts.createSourceFile(
    REGISTRY,
    readFileSync(REGISTRY, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const names = []
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'TOOLS' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const entry of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(entry)) continue
        for (const prop of entry.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'name' &&
            ts.isStringLiteral(prop.initializer)
          ) {
            names.push(prop.initializer.text)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (names.length === 0) throw new Error('No tools found in the registry — its shape changed')
  return names
}

// ─── In-page checks ─────────────────────────────────────────────────
//
// This function is stringified and evaluated in the page, so it can use no import and no closure.
// `root` selects what to inspect: the visible tool panel, or the shell around it.

/* eslint-disable */
function collectFindings(scope) {
  const INTERACTIVE = [
    'button',
    'input',
    'select',
    'textarea',
    'a[href]',
    '[role="button"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="combobox"]',
    '[role="slider"]',
    '[role="switch"]',
    '[role="menuitem"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0

  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]')).filter(visible)
  const panel = panels[0]
  if (scope === 'panel' && !panel) return { error: 'no visible tool panel' }

  /**
   * A short, human-findable description.
   *
   * A bare `textarea` is not actionable in a report, and the controls this flags are the ones with
   * no name to print. So this falls back through placeholder, type and nearby text until it has
   * something a reader can search the source for.
   */
  const describe = (el) => {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const named = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30)
    if (named) return `${tag}${id} "${named}"`
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) return `${tag}${id} [placeholder="${placeholder.slice(0, 40)}"]`
    const type = el.getAttribute('type')
    const near = el.closest('div')?.textContent?.trim().slice(0, 30)
    return `${tag}${id}${type ? `[type=${type}]` : ''}${near ? ` near "${near}"` : ''}`
  }

  const hidden = (el) =>
    el.closest('[aria-hidden="true"]') !== null || el.closest('[inert]') !== null || !visible(el)

  /**
   * Whether the element has an accessible name.
   *
   * This is the subset of the accname algorithm the app can produce: the label attributes, an
   * associated or wrapping `<label>`, own text, `title`, and an `alt` on a nested image. It is
   * deliberately generous — a name this misses is a false positive, and a rule nobody trusts is
   * worse than a rule that misses one form.
   */
  const hasAccessibleName = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return true
    const labelledBy = el.getAttribute('aria-labelledby')
    if (
      labelledBy &&
      labelledBy
        .split(/\s+/)
        .some((id) => document.getElementById(id)?.textContent?.trim())
    ) {
      return true
    }
    if (
      el.id &&
      Array.from(document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)).some((l) =>
        l.textContent?.trim()
      )
    ) {
      return true
    }
    if (el.closest('label')?.textContent?.trim()) return true
    // A `<select>`'s text is its options, and a form control's text is its value. Neither names
    // the control, so own text counts only for the elements whose content *is* the label.
    if (el.tagName !== 'SELECT' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      if (el.textContent?.trim()) return true
    }
    if (el.getAttribute('title')?.trim()) return true
    if (el.querySelector('img[alt]:not([alt=""])')) return true
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) {
      return Boolean(el.value?.trim())
    }
    return false
  }

  /**
   * Whether a text control is named only by its placeholder.
   *
   * HTML-AAM does fall back to `placeholder`, so these controls are not nameless and are reported
   * apart from the ones that are. They are still worth listing: the name disappears from view as
   * soon as the field holds text, which is the WCAG 1.3.1 and 3.3.2 failure.
   */
  const placeholderOnly = (el) => {
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false
    if (!el.getAttribute('placeholder')?.trim()) return false
    return !hasAccessibleName(el)
  }

  const findings = []
  const add = (rule, el, detail) => findings.push({ rule, element: detail ?? describe(el) })

  // The shell pass must not re-report the panel's contents, and vice versa.
  const inScope = (el) => {
    const insidePanel = panel ? panel.contains(el) : false
    return scope === 'panel' ? insidePanel : !insidePanel
  }

  const controls = Array.from(document.querySelectorAll(INTERACTIVE)).filter(
    (el) => inScope(el) && !hidden(el)
  )

  for (const el of controls) {
    if (el.tagName === 'INPUT' && el.type === 'hidden') continue
    if (placeholderOnly(el)) add('placeholder-only-name', el)
    else if (!hasAccessibleName(el)) add('unnamed-control', el)
  }

  // A control inside another control is unreachable by keyboard and ambiguous to a pointer.
  for (const el of controls) {
    const parent = el.parentElement?.closest(INTERACTIVE)
    if (parent && parent !== el) {
      add('nested-interactive', el, `${describe(el)} inside ${describe(parent)}`)
    }
  }

  // An id reference that resolves to nothing silently drops the relationship it was added for.
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      if (!inScope(el) || hidden(el)) continue
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) {
          add(`dangling-${attr}`, el, `${describe(el)} → #${id}`)
        }
      }
    }
  }

  // `htmlFor` pointing at nothing leaves the input unlabelled and the click target dead.
  for (const label of document.querySelectorAll('label[for]')) {
    if (!inScope(label) || hidden(label)) continue
    const target = label.getAttribute('for')
    if (!document.getElementById(target)) {
      add('dangling-label-for', label, `${describe(label)} → #${target}`)
    }
  }

  // Duplicate ids break every reference above, and the document owns the id space — so this is
  // reported once, from the shell pass, rather than per tool.
  if (scope === 'shell') {
    const counts = new Map()
    for (const el of document.querySelectorAll('[id]')) {
      counts.set(el.id, (counts.get(el.id) ?? 0) + 1)
    }
    for (const [id, count] of counts) {
      if (count > 1) add('duplicate-id', null, `#${id} appears ${count}×`)
    }
  }

  return { findings }
}
/* eslint-enable */

/**
 * Walks the tab order and reports stops with no focus indicator.
 *
 * This has to drive real Tab presses. `:focus-visible` does not match a programmatic `.focus()` on
 * a non-text control, so focusing from script reports a missing ring on controls that have one.
 *
 * The indicator is read as a resolved outline or box-shadow, which is what DESIGN_SYSTEM.md
 * specifies and what `lint-design-system.mjs` already requires in source.
 */
async function auditTabOrder(page, scope) {
  await page.evaluate(() => {
    document.activeElement instanceof HTMLElement && document.activeElement.blur()
  })
  await page.keyboard.press('Tab')

  const findings = []
  let truncated = false

  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    const stop = await page.evaluate((scopeArg) => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      // Mark the node itself rather than a string built from its name. Two id-less controls named
      // through `aria-labelledby` produce identical strings, and stopping on the second would end
      // the walk before it reached the rest of the panel.
      if (el.hasAttribute('data-audit-tab-seen')) return { wrapped: true }
      el.setAttribute('data-audit-tab-seen', '')
      const panel = Array.from(document.querySelectorAll('[role="tabpanel"]')).find(
        (p) => p.offsetParent !== null || p.getClientRects().length > 0
      )
      const insidePanel = panel ? panel.contains(el) : false
      const style = getComputedStyle(el)
      const tag = el.tagName.toLowerCase()
      const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || ''
      return {
        inScope: scopeArg === 'panel' ? insidePanel : !insidePanel,
        element: `${tag}${el.id ? `#${el.id}` : ''}${label ? ` "${label}"` : ''}`,
        // `outline-style: none` and a `0px` width both mean no outline is painted.
        hasOutline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
        hasShadow: style.boxShadow !== 'none' && style.boxShadow !== '',
        matchesFocusVisible: el.matches(':focus-visible'),
      }
    }, scope)

    if (!stop) break
    if (stop.wrapped) break

    if (stop.inScope && stop.matchesFocusVisible && !stop.hasOutline && !stop.hasShadow) {
      findings.push({ rule: 'focus-not-visible', element: stop.element })
    }

    await page.keyboard.press('Tab')
    if (i === MAX_TAB_STOPS - 1) truncated = true
  }

  // The marker must not leak into a later pass on the same page.
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-audit-tab-seen]')
      .forEach((el) => el.removeAttribute('data-audit-tab-seen'))
  })

  return { findings, truncated }
}

/** Opens a tool from the sidebar, then waits for its lazily-loaded panel to settle. */
async function openTool(page, name) {
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
  const button = page
    .getByRole('button', { name, exact: true })
    .filter({ visible: true })
    .first()
  await button.waitFor({ timeout: 20000 })
  await button.click()
  // The tool arrives through `Suspense`. Waiting for the panel beats a fixed sleep, but the panel
  // mounts before its children settle, so a short settle still follows.
  await page.locator('[role="tabpanel"]:visible').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(900)
}

function allowed(finding) {
  return ALLOWLIST.some((e) => e.rule === finding.rule && finding.element.includes(e.match))
}

async function main() {
  const args = process.argv.slice(2)
  const gate = args.includes('--gate')
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex === -1 ? null : args[onlyIndex + 1]

  const response = await fetch(URL_BASE).catch(() => null)
  if (!response?.ok) {
    console.error(`No harness on ${URL_BASE}. Start it with \`bun run dev\`, then run this again.`)
    process.exit(2)
  }

  const tools = readToolNames().filter((n) => !only || n.toLowerCase().includes(only.toLowerCase()))
  if (tools.length === 0) {
    console.error(`No tool matches "${only}".`)
    process.exit(2)
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'dark' })
  const page = await context.newPage()

  const results = []
  let suppressed = 0

  // The shell is the same behind every tool, so it is audited once. A tool still has to be open:
  // the tab strip and the tool title only exist once the workspace holds something.
  await openTool(page, tools[0])
  {
    const shell = await page.evaluate(`(${collectFindings.toString()})('shell')`)
    const order = await auditTabOrder(page, 'shell')
    const findings = [...(shell.findings ?? []), ...order.findings]
    results.push({ name: 'shell', findings, error: shell.error, truncated: order.truncated })
  }

  for (const name of tools) {
    try {
      await openTool(page, name)
      const result = await page.evaluate(`(${collectFindings.toString()})('panel')`)
      const order = await auditTabOrder(page, 'panel')
      const findings = [...(result.findings ?? []), ...order.findings]
      results.push({ name, findings, error: result.error, truncated: order.truncated })
    } catch (error) {
      results.push({ name, findings: [], error: error.message.split('\n')[0] })
    }
  }

  await browser.close()

  let total = 0
  for (const result of results) {
    const kept = result.findings.filter((f) => {
      if (allowed(f)) {
        suppressed += 1
        return false
      }
      return true
    })
    total += kept.length
    if (result.error) {
      console.log(`\n${result.name}\n  ! ${result.error}`)
      continue
    }
    if (kept.length === 0 && !result.truncated) continue
    console.log(`\n${result.name}`)
    for (const f of kept) console.log(`  [${f.rule}] ${f.element}`)
    if (result.truncated) console.log(`  ! tab order longer than ${MAX_TAB_STOPS} stops, truncated`)
  }

  const failed = results.filter((r) => r.error).length
  console.log(
    `\nrendered audit: ${results.length - 1} tools + shell · ${total} finding(s)` +
      `${suppressed ? ` · ${suppressed} allowlisted` : ''}${failed ? ` · ${failed} not audited` : ''}`
  )
  for (const entry of ALLOWLIST) console.log(`  allowlisted ${entry.rule}: ${entry.reason}`)

  process.exit(gate && (total > 0 || failed > 0) ? 1 : 0)
}

await main()
