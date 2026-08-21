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
| TypeScript | `npx tsc --noEmit`                | Pass           | _pending_         |
| Tests      | `bunx vitest run`                 | _see §7_       | _pending_         |
| ESLint     | `bun run lint`                    | Pass           | _pending_         |
| Design sys | `bun run lint:ds`                 | 0 violations   | _pending_         |
| Harness    | manual walk at 1440×900, 1024×700 | Findings U1–U6 | _pending_         |
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
- [ ] `Load sample` coverage is still inconsistent across tools. **Not addressed in this branch** —
      it is a content question (which tools deserve a sample, and what it should be) rather than a
      layout one, and deciding it tool-by-tool is its own piece of work.

**Acceptance:** met for the layout half; `Load sample` coverage remains open and is called out above
rather than quietly dropped.

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
- [ ] Theme swatches as miniature app previews — **not done.** This is a visual-design task of a
      different kind from the rest of this branch, and it is not blocked by anything here.

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

Delivered: U1 (both real items), U2 (layout), U3, U4, U5 (dialogs), U6, S1, S2.

Open and explicitly not done in this branch:

- U2 — `Load sample` coverage sweep.
- U5 — theme swatches as miniature app previews.
- S3 — screenshot baseline (blocked on manual capture, carried forward).

See §2 for the gate table.
