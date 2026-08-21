# TODO — Cockpit UI Elevation Backlog

Last updated: 2026-08-21
Branch: `feat/ui-consistency-pass`
Baseline commit: `86df84b`

This file was reset on 2026-08-21. The previous document tracked the **UI Audit Backlog** (C1–C6,
G1–G6, S1–S4), which is **complete** apart from **S3** (screenshot baseline, blocked on manual
capture) — that item is carried forward here as **S3** unchanged. See git history for
`documentation/TODO.md` at `86df84b` for the closure notes.

**Scope of this document:** the first audit of this app conducted at **runtime** rather than
statically. The previous two programmes were both source reads; this one drove the running app in
the browser harness and found a different class of problem — things that only appear once the app
is under load (ten tabs open), once two panels compete for width, or once a dialog's content
outgrows its box. Static analysis cannot see any of these.

---

## 1. Method

Driven through the browser harness (`bun run dev`, `http://localhost:1420`, Chromium with the
`__TAURI_INTERNALS__` stub injected by `scripts/vite-plugin-tauri-stub.js`) at two viewports —
1440×900 and 1024×700. jsdom cannot certify any of this; see `BROWSER_HARNESS.md` for why the
harness is the only honest verification surface for layout work.

Walked: JSON Tools, API Client, Regex Tester, Color Converter, Diff Viewer, the command palette,
the Settings dialog, the Keyboard Shortcuts dialog, the notes drawer, and collapsed-sidebar mode.
Each finding below was observed on screen before being written down.

The findings were then mapped across the whole app by four parallel scoped explorations (tab strip,
empty states, tool shell/toolbar, chrome dialogs) so that each fix lands **holistically** rather
than only in the tool where it was spotted. That mapping is the difference between this document
and a bug list.

---

## 2. Baseline gates

Run from `apps/cockpit`, never the monorepo root.

| Gate       | Command                           | At `86df84b`   | After this branch |
| ---------- | --------------------------------- | -------------- | ----------------- |
| TypeScript | `npx tsc --noEmit`                | Pass           | Pass              |
| Tests      | `bunx vitest run`                 | _see §7_       | 1618 pass, 0 fail |
| ESLint     | `bun run lint`                    | Pass           | Pass              |
| Design sys | `bun run lint:ds`                 | 0 violations   | 0 violations      |
| Harness    | manual walk at 1440×900, 1024×700 | Findings U1–U6 | Re-walked, clean  |
| Rust       | `cargo check` (from `src-tauri`)  | Untouched      | Untouched         |

---

## 3. P1 — Layout defects under load

These are the two findings a user would feel every day. Both are invisible at rest and only appear
once the app is actually being used.

### U1 — The tab strip collapses past ~6 open tools — **done (partly rejected)**

Observed at 1024×700 with ten tools open: labels truncate to `Case …`, `Hash …`, `Markd…`; the
leftmost tab is clipped mid-word (`olor …`); a native horizontal scrollbar renders **on top of** the
tab row, eating vertical space and overlapping the labels; and — worst — opening the notes drawer
scrolled the **active** tab out of view with nothing to bring it back.

The active-tab-out-of-view case is the real defect. Every other symptom is cosmetic; that one loses
the user's place in response to an unrelated action.

- [x] Scroll the active tab into view whenever the strip's available width changes — not just on
      tab activation. Done by routing the reveal through the strip's existing `ResizeObserver`
      (`WorkspaceTabStrip.tsx`). The old effect keyed on `[activeTabId, tabs]` only, so nothing that
      changed the strip's _width_ — notes drawer, sidebar collapse, resize-drag, window resize —
      ever re-triggered it. Resize-driven reveals use `behavior: 'auto'`; activation keeps `smooth`,
      because a resize-drag fires this on every frame and overlapping smooth scrolls fight.
- [x] Hide the native scrollbar on the strip. The root cause was subtler than "no hiding": the strip
      already carried `[scrollbar-width:none]`, which is a **Firefox-only** property, while
      `index.css` sets `::-webkit-scrollbar { height: 8px }` globally — and the app ships in
      WKWebView and WebView2. Added a `.no-scrollbar` utility covering both engines and switched the
      strip to it. Use that class, not the bare Tailwind arbitrary property.
- [x] ~~Give tabs a `min-width` that preserves icon + ~10 characters~~ — **rejected.** The existing
      112px minimum is already the outcome of this exercise; the code comment records that 52px was
      tried and rejected. Nothing to change.
- [x] ~~Never clip the first tab mid-word~~ — **rejected.** The "clipping" is the deliberate mask
      fade marking overflow, chosen over gradient overlays because those seam against the active
      tab. Working as designed.

**Acceptance:** met — the active tab survives every layout change, and no native scrollbar overlaps
the tab row on any engine.

### U2 — Empty states compete with the workspace instead of replacing it — **done for Diff Viewer**

Diff Viewer renders two empty Monaco editors squeezed into the top half of the pane **and** a full
"Nothing to compare / Load sample" panel occupying the bottom ~40%. The panel instructs the user to
paste into the editors it is crowding out. It is the only sizeable region on screen and it is
telling you to use the small one.

JSON Tools already gets this right — its empty state renders _inside_ the editor region and vanishes
on first keystroke. That is the pattern to generalise.

- [x] Diff Viewer: the comparison pane now collapses to a single prompt line (with `Load sample`)
      until there is a real result, via `grid-rows-[1fr_auto]` → `grid-rows-2`. The full `EmptyState`
      is kept for the **diff-only** view, where the pane is all there is — the principle is "an empty
      state must not shrink the input it points at", not "never use `EmptyState`".
- [x] Sweep every tool for the same shape. The cross-app map found Diff Viewer to be the only tool
      rendering an empty state as a _sibling block_ competing with a live input; every other empty
      state either owns its whole pane or renders inside the input region.
- [x] `Load sample` coverage swept across all 30 tools. This was deferred once as "a content
      question rather than a layout one", which was true — so it was answered as one. The rule
      applied, and the outcome per tool, is §3.1 below.

**Acceptance:** met.

### U2.1 — `Load sample` coverage: the rule and the outcome

A tool earns a sample when **its input is a structured format the user may not have to hand, and a
worked example teaches both the syntax and what the tool does with it**. That excludes three whole
categories, which is why the affordance was never going to reach 30 tools and should not have been
read as "inconsistent" without one.

**Added (4):**

| Tool           | Sample                                                   | Why                                                                                                                                                                                                           |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regex Tester   | pattern + flags + subject                                | The tool shows nothing until _both_ a pattern and a subject exist; a cold start meant inventing two things at once, and the tax falls hardest on the user who came here unsure of the syntax.                 |
| cURL → fetch   | POST with two headers, a body and a query string         | Exercises every branch of the converter. A bare `curl https://example.com` converts fine and demonstrates none of it.                                                                                         |
| CSS → Tailwind | a rule that is half convertible                          | The `unconvertible` list is the half of the output that matters most, and a cleanly-converting sample hides it.                                                                                               |
| Code Formatter | one deliberately mis-formatted snippet per language (12) | Keyed to the selector, because loading JS into a buffer set to SQL formats it as SQL and makes the tool look broken. One JS sample would leave the button missing for eleven languages, which reads as a bug. |

Every added sample is deliberately imperfect, matching the existing `html-validator` and
`css-validator` samples: one that arrives already correct makes the tool appear to do nothing.

**Not added, by category:**

- **Input is arbitrary text the user brings** — Base64, URL Codec, Case Converter, Hash Generator.
  Any string works; a sample teaches nothing.
- **Generates without input** — UUID Generator, Placeholder, Timestamp Converter (defaults to now).
- **Manages the user's own content** — Snippets, Prompt Templates, Markdown Editor, Notes. A sample
  here is not a demo, it is someone else's document in your library.
- **Equivalent affordance already exists under another name** — Mermaid Editor (`Load template`, a
  picker over several), CSS Specificity (inline examples), JSON Schema Validator (7 templates).
- **Would require a network call** — API Client. Its empty states are already well-formed, and a
  sample that reached a real endpoint would contradict "everything stays on this machine".
- **Empty state already teaches the tool** — Color Converter (the placeholder is the syntax), Image
  Tool, Docs Browser (both take files or navigation, not typed input).

**Also normalised:** the label. Three spellings existed for one gesture — `Load sample`,
`Load Sample` (JWT Decoder) and `Load example` (TS Playground, Refactoring Toolkit). All 16 sites now
read `Load sample`; Code Formatter's names the language (`Load SQL sample`) because there the sample
genuinely depends on it. A test asserts every formatter language has a sample, so adding a language
without one fails the suite rather than silently dropping the button.

**Watch out:** `scripts/lint-design-system.mjs` reads raw source text and cannot tell a CSS _sample_
from a `className` — nor does it spare comments. A sample containing a bare easing keyword or a hex
colour near the word `class` fails the gate even though it styles nothing, and the documented
escape-hatch comment does not help, because inside a template literal it would become part of the
sample. Pick properties that do not collide. This is recorded in `tool-samples.ts` too.

---

## 4. P2 — Consistency

### U3 — Tools do not share a layout grammar — **done, finding partly corrected**

Three tools, three different shells:

- **JSON Tools** — full-bleed, dense toolbar, live status strip (`Valid JSON · 11 keys · depth 3 ·
160 B`), view switcher, primary action. Exemplary.
- **Regex Tester** — _correction:_ it does have a toolbar (a plain `Toolbar`) and a `StatusBadge`
  match count. The original note said "no toolbar, no status strip"; that was an artefact of
  observing it with no pattern entered, when both are empty. The real gap was narrower.
- **Color Converter** — centered max-width column, no header chrome at all, seven stacked full-width
  rows each carrying its own identical `Copy` button.

- [x] Color Converter now has a `DocumentToolbar` + `DocumentIdentity` header with a live status
      (`#39FF14 · 7 formats`, or `Unrecognised color`). Before this it reported nothing: an
      unparseable input showed up only as the rest of the page silently not being there.
- [x] Color Converter's seven `Copy` buttons are gone. Each format row _is_ the copy target, with a
      hover/focus-revealed icon and an aria-label naming the format (`Copy RGB value rgb(…)`) —
      seven buttons all labelled "Copy" told a screen-reader user nothing about which was which.
- [x] Regex Tester's match badge now reads `2 matches` plus a `4 groups` suffix instead of a bare
      `2`. The capture-group total previously existed only in the sr-only live region, so a sighted
      user had to count parentheses.
- [x] ~~Move centered-column tools to full-bleed~~ — **not done, deliberately.** Color Converter's
      content is a form-style column of labelled rows, which is exactly the case `ToolLayout`'s
      `maxWidth` exists for. It gained the header grammar without the body restructure; converting
      it to full-bleed would be change for symmetry's sake.

**Acceptance:** met in the sense that matters — the tools that reported nothing about their state
now do.

### U4 — Cryptic controls with no labels — **finding was mostly wrong**

**Correction.** Regex Tester's flag pills are _not_ unlabelled: each already carries
`title={FLAG_TITLES[flag]}` (`Global — find all matches`), a matching `aria-label`, and
`aria-pressed`. The original observation was a failure to wait out the native tooltip delay, not a
defect. Recorded here so it is not "fixed" again.

- [x] The one genuine gap: the `Ref` ghost button had no title. It now has one, plus `aria-expanded`
      so its toggle state is exposed.
- [x] Flag pills: nothing to do — already labelled to both screen reader and sighted user.

### U5 — Settings and Shortcuts dialogs are undersized for their content — **done (dialogs)**

The theme grid holds 15+ swatches in a fixed ~830px-tall modal, so a 3-wide grid is scrolled through
a keyhole. The Shortcuts dialog is a long unfiltered list, clipped at the bottom.

- [x] Both dialogs now fill the `Dialog` primitive's existing `max-h-[90vh]` instead of stopping at
      a hardcoded `60vh` / `70vh`. The panel was already a flex column; the bodies just weren't
      participating in it, so ~30vh of available height went unused.
- [x] Shortcuts dialog has a pinned filter input; only the table below it scrolls. The filter is
      **substring, not Fuse** — deliberately. On ~25 two-word entries at the palette's 0.4 threshold,
      Fuse matches "tab" against "Toggle sidebar", and on a reference table a wrong row is worse than
      no row. It matches the rendered shortcut too, so `⌘K` and `cmd` both find the palette.
- [x] Theme swatches are miniature app previews. Each swatch now renders the real shell in
      miniature — title bar, sidebar rail with an accented active item, tab strip with one active
      tab, content, status bar — where it previously showed three abstract blocks. The mechanism was
      already right and is unchanged: the theme's class is applied to a scoped wrapper exactly as
      `tokens.css` applies it to `<html>`, so every band resolves `var(--color-*)` against that
      theme and **no colour is read or hardcoded in JS**. Only the geometry changed.

      The three blocks could not answer the questions that actually decide a theme: whether its
      surface separates from its background at all, whether its accent survives against its own
      active tab (the one place the accent meets `--color-bg` rather than `--color-surface`), and
      how loud its borders are. All three are legible now. Height went `h-8` → `h-12` to fit five
      bands; the dialog gained ~30vh earlier in this branch, so there is room.

      One incidental fix: `Swatch`'s `className` now _replaces_ the default instead of appending to
      it. `SystemSwatch` passes `h-full` for its half-width split, which previously left two height
      utilities on one element with the winner decided by Tailwind's emit order.

### U6 — Collapsed sidebar is a dead end — **finding overstated; the real gap is fixed**

**Correction.** The rail was not label-free: `SidebarCollapsedGroup` already had `aria-label`, a
portal-rendered hover tooltip, _and_ a full flyout tool list with keyboard dismissal. The original
"six ambiguous glyphs with no labels" is wrong.

The genuine gap was reachability: every tool cost two clicks (open flyout, pick tool), including the
ones you had explicitly pinned.

- [x] Pinned tools now get their own buttons at the top of the collapsed rail, above the groups, and
      activate on the first click (`SidebarCollapsedTool.tsx`). Stale pin ids — a tool that no longer
      exists — are skipped rather than rendering a hole, matching `SidebarPinned`.
- [x] The rail's arrow-key run includes them; a selector matching only groups would have let `Down`
      skip past the pins, which is exactly the wrong thing to skip.
- [x] Rail tooltips: already present, nothing to do.

**Acceptance:** met — a pinned tool is one click away from the collapsed rail.

---

## 5. P3 — Small wins

### S1 — Command palette rows show no shortcut hints — **done**

`⌘1`–`⌘9` switch to tabs by position and the palette never said so.

- [x] Tool rows for tools that are open in one of the first nine tabs now render that digit binding,
      built with `formatShortcut` (which owns the `⌘` symbol). A tool open in two tabs shows the
      leftmost, which is what the key actually does.

### S2 — The status bar is nearly empty — **decided**

- [x] Dropped the active tool's name from the status bar. The tab strip names the tool one strip
      above and each tool now carries its own live status in its document toolbar, so this was a
      third copy of the least informative of the three — permanently occupying the one slot where a
      transient message needs to be noticed. The remaining contents (last action, run count,
      keybinding mode, theme, pin, clock) all say something the rest of the chrome does not.
- Reclaiming the 28px was considered and rejected: the last-action slot is the only place transient
  feedback lands, and it has to exist somewhere.

### S3 — Screenshot baseline (carried forward, still blocked)

Unchanged from the previous document: no committed visual baseline exists, so regressions of exactly
the kind in §3 can only be caught by a human driving the harness. Blocked on manual capture.

---

## 6. Rejected / not doing

Recorded so they are not re-raised.

- **Tab `min-width` of 52px** — tried and rejected before this branch; the 112px minimum is the
  result. See the comment in `WorkspaceTabStrip.tsx`.
- **Removing the tab-strip mask fade** — it is the deliberate overflow affordance, chosen over
  gradient overlays because those seam against the active tab.
- **Tooltips on regex flag pills** — already there (U4).
- **Tooltips on collapsed sidebar group icons** — already there (U6).
- **Replacing the native scrollbar with custom arrows on the tab strip** — the overflow menu already
  covers this need. Two affordances for one job is worse than one.
- **Fuse.js for the shortcuts filter** — substring matching is correct for a 25-row reference table
  (U5).

---

## 7. Status

Delivered: U1, U2 (layout **and** the `Load sample` sweep, §3.1), U3, U4, U5 (dialogs **and** the
theme previews), U6, S1, S2, and the chrome pass C1–C11 in §8.

Open:

- S3 — screenshot baseline (blocked on manual capture, carried forward). This is now the only item
  left in this document, and it is the one that would have caught every defect in §3 and §8
  automatically.

See §2 for the gate table.

---

## 8. Chrome pass — title bar and toolbars

Added 2026-08-21, after §3–§5 landed. Same method as §1: driven in the harness, geometry measured
with DevTools rather than eyeballed, at 800px (the `minWidth` in `tauri.conf.json`), 1024px and
1512px.

### C1 — The command palette painted over the title-bar buttons — **done**

The palette was centred by a full-width `pointer-events-none` overlay. At 480px wide, its left edge
crosses x=170 below a window width of ~820px — over the icon cluster. Because the overlay does not
take pointer events, the buttons stayed **clickable while invisible**, which is worse than plain
occlusion. `minWidth` is 800, so this was reachable at the smallest window the app allows.

Fix: keep the overlay — true window-centring is the point — but give it a symmetric `SIDE_RESERVE`
gutter sized to the widest cluster on each platform (`px-[120px]` mac, `px-[224px]` elsewhere). The
palette now shrinks below 480px rather than overlapping. Verified at 800px: palette centre 400 =
window centre, 44px clear left, 88px clear right.

Equal-flex side columns were tried first and **rejected**: the macOS traffic-light allowance is
padding on one side only, and `flex-basis: 0` sizes the _content_ box, so the padding is added on
top and slides all three columns left (measured: palette centre 794 against a window centre of 756).

### C2 — Three icon buttons on the leading edge read as a fourth window control — **done**

14px separated them from the macOS traffic lights. Settings and Shortcuts moved to the trailing
edge — both are modal, rarely used, and reachable from the palette. Notes stays: it is the one
control with state worth glancing at (the badge). Locked by a test asserting DOM order around the
palette slot.

### C3 — Toolbar heights were ragged — **done**

`min-h-10` was a floor almost nothing reached: measured at 1024px, toolbars came out 42, 43, 46 and
47px depending purely on which controls a tool happened to contain, so the line under the tab strip
jumped on every tab switch. The tallest control in the app measures 31px, so `min-h-11` + `py-1.5`
puts the natural height (43px) _under_ the floor and the floor decides. Every non-wrapping toolbar
is now exactly 44px — and 44 is the title bar's `h-11`, so the chrome stack shares one rhythm.

### C4 — The toolbar divider was decided 13 times — **done, after a correction**

Eight of thirteen `DocumentToolbar` call sites had independently passed `border={false}`, leaving a
third of the app with a seam under its toolbar and two-thirds without. The default moved into the
primitive (`border = false`), the eight overrides were deleted, and the five toolbars that _lost_ a
divider were re-checked in the harness — the `--color-surface` → canvas transition separates them on
its own.

**The first attempt did not actually fix this**, and code review caught it. Removing the `border`
prop only unified the _prop_; eight tools re-express the same seam as a `border-b` on the `<header>`
or `<div>` that wraps the toolbar, which the sweep never looked at. So the app stayed split 8/5 on
whether a seam appears under the toolbar — the exact inconsistency C4 claimed to close, relocated
one element outwards.

The rule, stated properly: **the seam marks the bottom of the chrome block, not the bottom of a
toolbar row.** A wrapper gets `border-b` only when something genuinely stacks under the toolbar
inside it.

- Kept (a second row really is there): `JsonTools`, `CodeFormatter`, `TsPlayground` — collapsible
  options/query rows inside the wrapper.
- Made conditional: `CssValidator` and `HtmlValidator` now border the header only while `showRules`
  is open. Closed, they were single-row toolbars carrying a divider.
- Removed: `MermaidEditor`, `MarkdownEditor`, `YamlTools` — nothing stacks under the toolbar inside
  the wrapper. (`MarkdownEditor`'s formatting bar is a _sibling_ of the header with its own
  `border-b`, so the block still ends in one seam; the two chrome rows just no longer have a line
  between them.)

All five re-verified in the harness, including CSS Validator with the rules panel both open and
closed.

### C5 — The selected segment competed with primary actions — **done**

`SegmentedControl` filled the selected segment with solid `--color-accent`, making a _view mode_
as loud as a button. JSON Tools showed "Format" and "Source" fighting for the same emphasis. Now
`--color-accent-dim` + `font-semibold`: state reads as state.

### C6 — The active-tab indicator read as a divider artifact — **done**

A 40px centred pill (20px when pinned) sat on the title bar's divider line with empty tab either
side, so it looked like a flaw in the divider rather than a marker for its tab. Now full tab width
(`inset-x-0`), square. The existing rationale for keeping it at `top-0` — don't sever the seam — was
honoured; only the width changed.

### C7 — JSON Tools buried its primary actions on wrap — **done**

The bar wraps to two rows at 1024px. With view options first, the wrap put Indent/Path/view-mode on
row one and every primary action underneath. Groups reordered so the least important row sheds last.

### C8–C11 — Unlabelled Save buttons — **done**

Seven tools had an icon-only floppy disk sitting among five labelled buttons, which reads as a
different class of control: CSV, XML, YAML, Code Formatter, TS Playground, Refactoring Toolkit,
JSON Schema Validator (plus JSON Tools under C7). All now `variant="secondary"` with a visible
`Save` label, keeping their existing `aria-label` (more specific, and WCAG 2.5.3-compliant since the
accessible name contains the visible one).

**Not changed:** Mermaid Editor, CSS Validator and HTML Validator pair an icon-only Open with an
icon-only Save. That reads as a coherent icon group; labelling only one half would break it.
