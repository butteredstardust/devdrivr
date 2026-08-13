# TODO - Cockpit Backlog

Last updated: 2026-08-13

This is the working backlog for `apps/cockpit`. Keep this document focused on actionable engineering
work: every item should have evidence, an expected outcome, acceptance criteria, and a verification
path.

The 2026-07-30/31 reliability backlog (P0 and P1 in full, and most of P2) is complete and has been
removed from this file — see git history for `documentation/TODO.md` if you need the closure notes.
What survives below is the four quality items that were never started, plus the UI modernisation
programme filed on 2026-08-13.

## Current Snapshot

Verified locally from `apps/cockpit` on 2026-07-31:

| Gate        | Command                                        | Result                          |
| ----------- | ---------------------------------------------- | ------------------------------- |
| TypeScript  | `npx tsc --noEmit`                             | Passing                         |
| Tests       | `bunx vitest run`                              | Passing: 79 files, 664 tests    |
| ESLint      | `bun run lint`                                 | Passing with zero warnings      |
| Rust check  | `cargo check` from `src-tauri`                 | Passing                         |
| Rust clippy | `cargo clippy -- -D warnings` from `src-tauri` | Passing                         |
| Release     | `bun run tauri build`                          | Passing: builds `.app` + `.dmg` |

Commands no longer need a `PATH="/opt/homebrew/bin:$PATH"` prefix; older entries in this file still
show one. See the PATH section in `CLAUDE.md` for what changed.

## How To Use This Backlog

- Work P0 before P1, and P1 before P2 unless a lower-priority item is blocking current release work.
- Convert broad TODOs into small PRs with one clear risk area per PR.
- Keep completed items in this file until the next release branch is cut, then move notable outcomes
  into release notes or the relevant documentation.
- For each PR, update the item with links to tests, manual smoke notes, or follow-up issues.

---

## UI Modernisation Programme

Filed 2026-08-13 after a hands-on audit of the running app. Reference screenshots are in
`/screenshots/ui-audit-*.png` at the repo root.

Scope: the shell (sidebar, tab strip, status bar, palette, settings) and the visual language shared
across the 30 tools. Not a rewrite — no new UI framework, no component library, no design-system
package. Tailwind 4 plus CSS custom properties stay.

## How the audit was run

The app hard-fails outside Tauri: `getCurrentWindow()` throws at `src/app/providers.tsx:30` and the
UI renders the "Failed to initialize" retry screen. Stubbing `window.__TAURI_INTERNALS__` before page
load — `metadata.currentWindow`, `plugin:sql|load` / `|select` / `|execute` returning empty results,
`plugin:event|listen` returning an id — boots the entire shell against an empty database in a normal
browser, which is what made a Playwright review possible. See the Phase 5 item on keeping that
harness.

## Measured baseline

From `apps/cockpit/src`, excluding tests, on 2026-08-13:

| Signal                                              | Count   |
| --------------------------------------------------- | ------- |
| Arbitrary Tailwind values in tools + components     | 1149    |
| Hardcoded `text-xs`                                 | 332     |
| Raw `<button>` in `src/tools`                       | 130     |
| Files importing `shared/Button`                     | 29      |
| Raw `<input>` vs files importing `shared/Input`     | 53 / 18 |
| Unstyled native `<select>`                          | 7       |
| `prefers-reduced-motion` handling anywhere in `src` | 0       |

## P0 - Broken behaviour

### [ ] Unmount the inactive sidebar variant instead of fading it to `opacity: 0`

Area: shell / accessibility / hit-testing

Problem: `src/components/shell/Sidebar.tsx` renders the expanded and collapsed trees at the same time
and cross-fades between them with `opacity`. The hidden tree keeps real geometry, real focus order,
and real hit-testing.

Evidence: with the sidebar expanded, `document.querySelectorAll('button[aria-label="Open settings"]')`
returns two buttons — the visible one at `(44, 836)` and an invisible one at `(94.5, 796)` whose
ancestor has `opacity: 0`. `elementFromPoint` over the invisible one returns a "Prompt Templates"
button from the collapsed tree. Playwright could not click the sidebar footer at all: every attempt
reported the collapsed tree intercepting pointer events. Screen readers see all 30 tools twice, and
Tab walks through a tree the user cannot see.

Expected outcome: exactly one sidebar tree is present, focusable, and hit-testable at any time.

Acceptance criteria:

- The inactive variant is either conditionally rendered or marked `hidden` + `inert`; a CSS-only
  `pointer-events-none` is not sufficient because it leaves the tab order and accessibility tree
  intact.
- The collapse/expand transition still reads as a transition rather than a snap.
- A test asserts exactly one `[aria-label="Open settings"]` and exactly one node per tool id in the
  DOM, in both collapsed and expanded states. Confirm it fails against the current code first.

Verification:

```bash
cd apps/cockpit
bunx vitest run src/components/shell
npx tsc --noEmit
```

### [ ] Give overlays a scrim, centring, and elevation

Area: shell / modals

Problem: the Settings panel and the ⌘K command palette render as bare bordered panels floating over
fully-legible content, offset up and to the left of centre, with no backdrop and no shadow beyond a
1px border. In `ui-audit-08-settings.png` the Color Converter rows read straight through beside the
modal; it looks like a rendering fault rather than a layer.

Expected outcome: overlays read as a layer above the app.

Acceptance criteria:

- `src/components/shared/Dialog.tsx`, `SettingsPanel.tsx`, and `CommandPalette.tsx` share one scrim
  (semi-transparent backdrop) and one elevation treatment.
- The palette is horizontally centred and anchored near the top (roughly 15-20vh); dialogs are
  centred both ways.
- Existing focus-trap, Esc-to-close, and click-outside behaviour is preserved, and the scrim does not
  swallow the events those depend on.
- The scrim respects the reduced-motion item below (no fade when reduced motion is requested).

Verification:

```bash
cd apps/cockpit
bunx vitest run src/components
npx tsc --noEmit
```

### [ ] Give the 12 cockpit-native themes real Monaco token rules

Area: editors / theming

Problem: `src/hooks/useMonaco.ts` builds themes for the 12 cockpit-native app themes from CSS custom
properties via `buildCockpitTheme()`, which returns `rules: []`. Monaco falls back to the bare `vs` /
`vs-dark` base, so code in those themes renders with little to no syntax differentiation. Only the 10
imported `monaco-themes` JSONs (dracula, monokai, nord, night-owl, github-\*, solarized-\*,
tomorrow-night, oceanic-next) highlight properly. The default theme is one of the good ones, which is
why this is easy to miss.

Expected outcome: every app theme highlights code.

Acceptance criteria:

- `buildCockpitTheme()` emits a token rule set covering at least comment, string, number, keyword,
  type, function, and operator, derived from the theme's existing `--color-accent`, `--color-info`,
  `--color-success`, `--color-warning`, and `--color-text-muted` variables.
- Contrast against `--color-surface` is checked for each derived colour; nothing lands below ~3:1.
- A test asserts the built theme has a non-empty `rules` array for a cockpit-native theme.
- No new dependency: the derivation uses the existing `getCssColor` helper.

Verification:

```bash
cd apps/cockpit
bunx vitest run src/hooks
npx tsc --noEmit
```

### [ ] Honour `prefers-reduced-motion`

Area: accessibility

Problem: `src` contains no `prefers-reduced-motion` handling at all, while the shell animates sidebar
collapse, tab transitions, toasts, the status-bar fade, and a spinner.

Expected outcome: users who ask the OS for reduced motion get a still interface.

Acceptance criteria:

- One `@media (prefers-reduced-motion: reduce)` block neutralising transition and animation duration
  app-wide, with any genuinely necessary exception documented inline.
- Spinners degrade to a static or opacity-only indicator rather than disappearing.

Verification:

```bash
cd apps/cockpit
bun run lint
```

## P1 - Design tokens

### [ ] Split `index.css` and add the missing scales

Area: theming / CSS architecture

Problem: `src/index.css` is 869 lines mixing font imports, theme custom properties for 22 themes, and
highlight.js token colours for those same 22 themes. There are no tokens for spacing, radius, type
scale, or elevation, which is why tools hardcode `p-1.5`, `text-xs`, and `rounded` inline 1149 times.
`--color-surface-hover` and `--color-surface-raised` are also identical in most themes, so hover
states have nowhere to go.

Expected outcome: a token layer worth building components against.

Acceptance criteria:

- Highlight.js blocks move to `src/styles/highlight-themes.css`; theme variables move to
  `src/styles/tokens.css`; `index.css` imports both and keeps only global element styles.
- New tokens: `--space-1..8`, `--radius-sm/md/lg`, `--text-xs/sm/base/lg`, `--elevation-1/2/3`,
  `--focus-ring`, `--color-surface-sunken`, and a `--color-surface-hover` that differs from
  `--color-surface-raised` in every theme.
- No visual regression: the 22 themes still resolve every variable they resolved before. A test or
  script asserting every theme class defines the full token set is preferred over eyeballing.

### [ ] Introduce a UI font distinct from the code font

Area: typography

Problem: every label, button, settings row, and menu item renders in Source Code Pro. Monospace for
chrome costs horizontal space and legibility, and it is why sidebar labels truncate at ~14 characters
("TypeScript Playgr…", "JSON Schema Valid…").

Acceptance criteria:

- A `--font-ui` token, defaulting to a system UI stack, applied to shell chrome and form labels.
- `--font-mono` stays on values, editors, code output, and anything the user might diff by eye.
- Themes can opt back into full-mono by pointing `--font-ui` at `--font-mono`; at least one theme
  keeps the all-mono look so the aesthetic is still available.

## P2 - Shared primitives

### [ ] Extend the primitive set

Area: `src/components/shared`

Problem: `Button.tsx` offers 3 variants and 2 sizes that both render `text-xs`. There is no `Select`,
no `Field`, no `EmptyState`, no `Toolbar`, and no segmented control — so Match/Replace,
Edit/Split/Preview, and Formats/Shades/Harmony are three separate hand-rolled implementations of the
same control.

Acceptance criteria:

- `Button` gains `danger` and `icon` variants, an `xs` size, a `loading` state, and a focus-visible
  ring drawn from `--focus-ring`.
- New primitives: `Select` (replacing all 7 native selects), `Field`, `EmptyState`, `Panel`,
  `Toolbar`, `SegmentedControl`.
- Every primitive consumes the Phase 1 tokens; no raw pixel values.
- Each primitive has a focused test in `src/components/shared/__tests__/`.

### [ ] Add a `ToolLayout` and migrate tools onto it

Area: cross-tool consistency

Problem: no layout contract exists between tools. Color Converter pads its content 34px, Regex Tester
is edge-to-edge at 0px, JSON Tools puts its tab row flush at the top while Regex Tester puts one
under a control bar, and nothing constrains content width — a 7-character hex value gets a 1200px row
with its Copy button roughly 1100px away from the value it copies.

Acceptance criteria:

- `ToolLayout` provides an optional header (title, description, actions), an optional toolbar slot, a
  body with consistent padding, a `max-w` for form-style tools, and a full-bleed opt-out for
  editor-style tools.
- Tools migrate one group per PR, starting with CONVERT (9 tools, simplest markup).
- Ratchet target once the migration completes: raw `<button>` in `src/tools` under 30, arbitrary
  Tailwind values under 400.

## P3 - Shell UX

### [ ] Sidebar filter box

All 30 tools sit in 8 always-expanded groups, so at 900px height the bottom third is permanently
below the fold. Add a filter input at the top of the sidebar, focused by `/`, reusing the Fuse.js
scoring already implemented in `CommandPalette.tsx` rather than a second search implementation.
Filtering collapses groups with no matches.

### [ ] Persist group collapse state

Default to collapsing groups the user has never opened a tool from, and remember explicit
collapse/expand choices across launches.

### [ ] Tool icons in tabs

Every tool has an icon in `src/app/tool-registry.ts`, but `WorkspaceTabStrip` renders text only, so a
six-tab strip has no shape to scan by. The strip's overflow scrolling and fade affordances already
work and should not be disturbed.

### [ ] Theme picker with swatches

23 themes in a native `<select>` with no preview. Replace with a grid of preview chips (bg, surface,
accent, text) grouped Dark / Light, live-previewing on hover and reverting if the user cancels.

### [ ] Better empty states

The workspace placeholder ("Select a tool to get started") should surface recent and pinned tools as
clickable chips. Per-tool empty panes should offer a "Load sample" action — `apps/cockpit/samples/`
already exists.

### [ ] Tooltip or wrap for truncated tool names

At the current 218px sidebar width, several tool names truncate mid-word with no way to read them.

## P4 - Guardrails

### [ ] Keep the browser harness

Check in the Playwright init script that stubs `__TAURI_INTERNALS__` (see "How the audit was run"
above) plus a small script that boots the dev server and captures the shell. This is the basis for
screenshot review and, later, visual regression. It must not ship in the app bundle.

### [ ] Lint rule against raw form elements in `src/tools`

Once the primitive migration lands, add `react/forbid-elements` for `button`, `input`, and `select`
under `src/tools`, with a documented escape hatch for genuine one-offs.

### [ ] Contrast pass across all 22 themes

Check `--color-text-muted` on `--color-surface` for every theme. The app ships a WCAG contrast
checker in Color Converter; point it at cockpit's own tokens.

---

## Remaining quality backlog

Carried over from the 2026-07-30 reliability audit; these four were never started.

### [ ] Add a no-regression audit for cockpit non-negotiables

Area: contributor safety / architecture guardrails

Problem: `AGENTS.md` lists critical rules that prevent known failures: DB singleton access, no
StrictMode, no new Tauri windows, DPI conversion, worker imports, theme timing, CSS variables, and
Phosphor icons. Some are checked by hooks, but the coverage should be explicit and easy to run.

Expected outcome: New PRs get fast, deterministic feedback for cockpit-specific architecture rules.

Acceptance criteria:

- Add or document a single audit command that checks the non-negotiables.
- Audit covers `Database.load()` outside `src/lib/db.ts`, `React.StrictMode`,
  `new WebviewWindow`, Comlink `expose`, module worker construction, module-level `applyTheme`,
  missing DPI conversion near window APIs, hardcoded colors, npm/yarn commands, and non-Phosphor
  icons.
- The audit runs in CI or is explicitly required in the PR checklist.

Verification:

```bash
cd apps/cockpit
bun run lint
npx tsc --noEmit
```

### [ ] Improve updater behavior coverage

Area: updater / release channel reliability

Problem: The updater depends on GitHub release assets and `latest.json`. Release workflow verifies
asset presence, but UI behavior around network errors, manual checks, automatic checks, and silent
downloads needs focused coverage.

Expected outcome: Update checks are reliable, non-blocking, and clear when offline or when the
manifest is incomplete.

Acceptance criteria:

- Tests cover available update, no update, network failure, malformed manifest, missing platform,
  dismissed notifications, and manual retry.
- Manual smoke confirms automatic checks do not block startup.
- Release workflow still fails when expected platform assets or `latest.json` are missing.

Verification:

```bash
cd apps/cockpit
bunx vitest run src/stores src/components
```

### [ ] Add performance budgets for large inputs

Area: tool responsiveness / desktop UX

Problem: Several tools can process large text, CSV, XML, images, or generated history. Regressions
may show up as UI stalls rather than test failures.

Expected outcome: Large-input handling has practical budgets and protects the main thread where
possible.

Acceptance criteria:

- Define representative large-input fixtures for JSON, XML, CSV, Markdown, Diff Viewer, Regex
  Tester, and Image Tool.
- Measure parse/format/render behavior with repeatable local scripts or Vitest performance checks.
- Add debouncing, workers, chunking, or limits where a tool blocks interaction beyond the agreed
  budget.
- Document any intentional input-size limits in tool UI or troubleshooting docs.

Verification:

```bash
cd apps/cockpit
bunx vitest run src/tools/__tests__
```

### [ ] Keep quality docs synchronized

Area: documentation / contributor onboarding

Problem: `README.md`, `PRODUCT_MAP.md`, `TESTING.md`, `RELEASE_SMOKE_TESTS.md`, `AGENTS.md`, and
this backlog can drift as quality work lands.

Expected outcome: Contributors can find the current source of truth without stale test counts,
commands, or status claims.

Acceptance criteria:

- Update test counts in docs when the suite changes materially.
- Move completed release-smoke or testing improvements into `TESTING.md` and
  `RELEASE_SMOKE_TESTS.md`.
- Keep `AGENTS.md` command guidance aligned with CI and package scripts.
- Link new quality artifacts from the README documentation table when they become permanent.

Verification:

```bash
cd apps/cockpit
bunx vitest run
bun run lint
```

## Release Readiness Checklist

Before cutting or promoting a cockpit release, confirm:

- [ ] Cockpit CI is green for the release commit.
- [ ] Frontend typecheck, lint, and Vitest pass locally.
- [ ] Rust `cargo check` and `cargo clippy -- -D warnings` pass locally or have a documented,
      environment-specific exception.
- [ ] Release workflow produced all expected platform artifacts.
- [ ] `latest.json` exists and maps `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and
      `linux-x86_64`.
- [ ] Cross-platform smoke results are recorded against downloaded release artifacts.
- [ ] Any platform-specific defect is documented before the release leaves internal validation.

## Maintenance Notes

- Prefer small PRs that improve one risk area at a time.
- Do not add new npm packages for quality work unless platform APIs and existing tools are
  insufficient.
- New tests should follow established locations: tool tests in `src/tools/__tests__/`, library tests
  in `src/lib/__tests__/`, store tests in `src/stores/__tests__/`, and component tests colocated per
  subdirectory in `src/components/<subdir>/__tests__/` (e.g. `src/components/shell/__tests__/`,
  `src/components/shared/__tests__/`) — there is no single flat `src/components/__tests__/`.
- Keep commands Bun-first and run cockpit commands from `apps/cockpit`.
