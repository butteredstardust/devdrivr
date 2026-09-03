#!/usr/bin/env bun
/**
 * Regenerates the README screenshots.
 *
 *   bun run screenshots            # all of them
 *   bun run screenshots overview   # just the named ones
 *
 * Drives the **browser harness** (`bun run dev`), not the native window: Chromium is the only one
 * of the four harnesses that can be scripted reliably, and it renders the same React tree, the same
 * title bar and the same layout the app ships. See documentation/HARNESSES.md.
 *
 * The API Client scene needs a real request. The stub forwards `plugin:http|fetch` to the page's own
 * `fetch`, which is enough for the CORS-enabled URL that scene uses. `SCREENSHOT_URL` can point this
 * at the remote harness (`bun run dev:remote`, port 9090) instead, but that one serves the real
 * database, so the shots would carry whatever theme and history the machine happens to have.
 *
 * Every scene reloads the page first, so a failed run can never leave state behind that makes the
 * next scene pass for the wrong reason.
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'screenshots')
const URL = process.env.SCREENSHOT_URL ?? 'http://localhost:1420'

/**
 * Matches the existing set. Not arbitrary: the README renders these at full width on a page whose
 * content column is ~1000px, so anything wider is downscaled and anything narrower collapses the
 * sidebar's responsive breakpoints.
 */
const VIEWPORT = { width: 1200, height: 766 }

/**
 * Screenshots are taken at the app's default theme — `system` — rather than a picked one, so the
 * README shows what a first launch actually looks like. `system` follows the OS, which would
 * otherwise make the output depend on whoever ran this, so the context pins `colorScheme` instead
 * of reaching into the DOM. Forcing a class on `<html>` would also leave the status bar reading
 * "System" while the palette said otherwise.
 */
const COLOR_SCHEME = 'dark'

/** The request the API Client scene sends. See that scene for why it is this URL. */
const REQUEST_URL = 'https://raw.githubusercontent.com/butteredstardust/devdrivr/main/package.json'

/**
 * Tabs are opened in this order before any scene runs, so the tab bar in every shot shows a
 * plausible working session rather than a single lonely tab.
 */
const TABS = [
  'Code Formatter',
  'Markdown Editor',
  'Mermaid Editor',
  'Diff Viewer',
  'YAML Tools',
  'CSV Tools',
]

/** @typedef {{ name: string, tool: string, setup?: (page: import('playwright-core').Page) => Promise<void> }} Scene */

/** @type {Scene[]} */
const SCENES = [
  {
    name: 'devdrivr-overview',
    tool: 'Mermaid Editor',
    async setup(page) {
      // Class diagram rather than the default flowchart: it fills the preview pane, which is the
      // point of a hero shot that exists to show the split view.
      await control(page, 'Diagram template', 'combobox').selectOption({ label: 'Class diagram' })
      await click(page, 'Load')
      await click(page, 'Split', 'radio')
      // Mermaid renders asynchronously; the shutter has to wait for the diagram, not the click.
      await page.locator('svg[id^="mermaid"]').first().waitFor({ timeout: 15000 })
      await settle(page, 800)
    },
  },
  {
    name: 'devdrivr-code-formatter',
    tool: 'Code Formatter',
    async setup(page) {
      await click(page, /^Load .* sample$/)
      // Format only *previews* the reformat — it parks the result behind Apply format / Discard
      // preview, so the header goes on saying "Not formatted yet" until one of those is pressed.
      // Both steps are needed to photograph a formatted document. At 1200px the Format button
      // itself is folded into the toolbar's overflow menu, and ⌘↵ is scoped to the editor.
      await click(page, 'More actions')
      await click(page, /^Format/)
      await settle(page)
      await click(page, 'More actions')
      await click(page, 'Apply format')
      await settle(page)
      await click(page, 'Style')
      // The popover fades in. Without this the shutter catches it part-way and the code shows
      // straight through the panel.
      await settle(page)
    },
  },
  {
    name: 'devdrivr-code-tools',
    tool: 'Diff Viewer',
    async setup(page) {
      await click(page, /^Load sample$/)
      await settle(page)
    },
  },
  {
    name: 'devdrivr-data-tools',
    tool: 'YAML Tools',
    async setup(page) {
      await click(page, /^Load sample$/)
      // Source alone is just a text editor. Tree puts the inspector beside it, which is the thing
      // worth photographing and what the README caption promises.
      await click(page, 'Tree', 'radio')
      await settle(page)
    },
  },
  {
    name: 'devdrivr-csv-tools',
    tool: 'CSV Tools',
    async setup(page) {
      await click(page, /^Load sample$/)
      await settle(page)
    },
  },
  {
    name: 'devdrivr-writing-tools',
    tool: 'Markdown Editor',
    async setup(page) {
      // The editor opens on an empty document, which photographs as a blank pane next to the
      // placeholder text — true to the app and useless as a screenshot of what it does.
      await click(page, 'Templates')
      await click(page, 'README')
      await settle(page)
    },
  },
  {
    name: 'devdrivr-api-client',
    tool: 'API Client',
    async setup(page) {
      // This repo's own package.json: a stable public URL that returns readable JSON, and one
      // whose content dates the screenshot honestly. The previous shot pointed at
      // apps/cockpit/package.json, a path that stopped existing when the monorepo was flattened.
      await control(page, 'Request URL', 'textbox').fill(REQUEST_URL)
      await click(page, 'Send')
      // The response pane shows the bare status code, not "200 OK". `exact` rather than a regex:
      // regex matching skips Playwright's whitespace normalisation, so an anchored `/^200$/` misses
      // the pill whenever its text node carries the surrounding indentation.
      await page.getByText('200', { exact: true }).first().waitFor({ timeout: 20000 })
      await settle(page)
    },
  },
]

/**
 * Every lookup goes through `visible=true`, and that is load-bearing rather than defensive.
 * Switching tabs does not unmount the tool you left: its panel stays in the DOM at zero size. So
 * with six tabs open there are six "Load sample" buttons, five of them unclickable, and a plain
 * `.first()` resolves by DOM order — which is tab-open order, not the active tool. That silently
 * photographs the right tool having clicked the wrong tool's button, or hangs for 30s.
 *
 * `filter`, not `.locator('visible=true')`: the latter matches visible *descendants* of the button,
 * which happens to work whenever the label is wrapped in a span and hangs forever when it isn't.
 */
function control(page, name, role) {
  return page
    .getByRole(role, { name, exact: typeof name === 'string' })
    .filter({ visible: true })
    .first()
}

/**
 * Clicks a control by its exact accessible name, or by pattern for labels that vary per tool.
 * `role` is worth passing explicitly: the Edit/Split/Preview segmented controls are `role="radio"`,
 * so looking for a button finds nothing even though they are `<button>` elements.
 */
async function click(page, name, role = 'button') {
  const target = control(page, name, role)
  await target.waitFor({ state: 'visible', timeout: 10000 })
  await target.click()
}

/** Lets debounced work, editor layout and any animation land before the shutter. */
async function settle(page, ms = 600) {
  await page.waitForTimeout(ms)
}

async function main() {
  const only = process.argv.slice(2)
  const wanted = only.length
    ? SCENES.filter((s) => only.some((arg) => s.name.includes(arg)))
    : SCENES

  if (!wanted.length) {
    console.error(`No scene matches ${only.join(', ')}. Known: ${SCENES.map((s) => s.name).join(', ')}`)
    process.exit(1)
  }

  await mkdir(OUT, { recursive: true })

  const browser = await chromium.launch()
  // deviceScaleFactor stays at 1: the existing set is 1200×766 actual pixels, and a 2× capture
  // quadruples seven PNGs in a repo that has to clone quickly for a marginal gain on GitHub.
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: COLOR_SCHEME })
  const page = await context.newPage()

  let failed = 0

  for (const scene of wanted) {
    try {
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: TABS[0], exact: true }).waitFor({ timeout: 15000 })

      // Opening a tool that already has a tab just re-selects it, so this both builds the tab bar
      // and lands on the scene's tool whether or not it is one of the standing tabs.
      for (const tab of TABS) await click(page, tab)
      await click(page, scene.tool)
      await settle(page)

      await scene.setup?.(page)

      await page.screenshot({ path: join(OUT, `${scene.name}.png`) })
      console.log(`✓ ${scene.name}`)
    } catch (error) {
      failed++
      console.error(`✗ ${scene.name} — ${error.message.split('\n')[0]}`)
    }
  }

  await browser.close()
  process.exit(failed ? 1 : 0)
}

await main()
