# TODO — Cockpit Tool UI Consistency Programme

Last updated: 2026-08-19
Branch: `chore/tool-ui-consistency-audit`

This file was reset on 2026-08-19. The previous backlog (July reliability work + the 2026-08-13 UI
modernisation programme) was complete or superseded; see git history for `documentation/TODO.md` if
you need the closure notes.

**Scope of this document:** an audit of every tool's chrome — title, toolbar, pane headers, buttons,
labels, empty/error states — and a phased plan to converge them on a small set of reusable,
maintainable primitives.

---

## 1. Method

Static audit of `src/tools/**` (36 non-test `.tsx` files across 30 tools) plus
`src/components/shared/**` and `src/styles/tokens.css`, on 2026-08-19 at commit `19af685`.

Every finding below carries a count and at least one file reference. Counts came from grep over
`src/tools` excluding `__tests__`. No runtime/visual inspection was performed — Phase 0 includes a
screenshot pass to catch anything static analysis cannot see.

---

## 2. Where we actually are

The good news first, because it shapes the plan: **the primitive layer is already broadly adopted.**
This is a convergence job, not a rewrite.

| Primitive          | Tool files importing it | Verdict                       |
| ------------------ | ----------------------- | ----------------------------- |
| `Button`           | 33 / 36                 | Near-universal                |
| `CopyButton`       | 26 / 36                 | Near-universal                |
| `ToolLayout`       | 27 / 36                 | Strong                        |
| `Alert`            | 22 / 36                 | Strong                        |
| `EmptyState`       | 18 / 36                 | Partial                       |
| `Toolbar`          | 20 / 36                 | Partial — the main gap        |
| `SegmentedControl` | 13 / 36                 | Fine (view-mode tools only)   |
| `TabBar`           | 4 / 36                  | Fine (multi-mode tools only)  |
| `Field`            | 1 / 36                  | **Effectively unadopted**     |
| `Panel`            | 0 / 36                  | **Dead — tested, never used** |

There are **zero** raw `<input>`, `<textarea>`, or `<select>` elements in the tool layer, and only 12
raw `<button>` elements across 5 files. Form controls and buttons are solved. What is _not_ solved is
everything **around** them: the container, the section label, the pane header, and the scale.

---

## 3. Findings

### F1 — Section labels have ~7 competing visual idioms (highest impact)

The same semantic thing — "a small label naming a region" — is styled seven different ways. Grep for
`uppercase` in `src/tools` returns 21 distinct class strings.

| Idiom                                                       | Uses | Example                                    |
| ----------------------------------------------------------- | ---- | ------------------------------------------ |
| A. `font-ui text-2xs font-semibold uppercase tracking-wide` | 6    | `json-tools/JsonTools.tsx:731`             |
| B. `text-2xs font-semibold uppercase tracking-wider`        | 5    | `image-tool/ImageTool.tsx:896`             |
| C. `font-mono text-2xs uppercase tracking-widest`           | 6    | `prompt-templates/PromptTemplates.tsx:628` |
| D. `font-mono text-xs text-muted` (sentence case)           | 3    | `hash-generator/HashGenerator.tsx:114`     |
| E. `text-2xs font-bold uppercase tracking-wide` (as `<h2>`) | 3    | `css-validator/CssValidator.tsx:611`       |
| F. `font-mono text-sm` (as `<h2>`)                          | 6    | `uuid-generator/UuidGenerator.tsx:241`     |
| G. `text-[9px] uppercase tracking-wide` (off-scale)         | 2    | `color-converter/ColorConverter.tsx`       |

Three axes vary independently and meaninglessly: font (`font-ui` vs `font-mono`), weight
(`medium`/`semibold`/`bold`), and tracking (`wide`/`wider`/`widest`). Idiom G escapes the type scale
entirely with a hardcoded `text-[9px]`.

**This is the single biggest source of "these tools feel like different apps."**

### F2 — Pane headers are copy-pasted, not shared

Five tools carry this string **verbatim**:

```
border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]
```

`regex-tester/RegexTester.tsx:306`, `css-specificity/CssSpecificity.tsx:246`,
`url-codec/UrlCodec.tsx:197`, `curl-to-fetch/CurlToFetch.tsx:323`,
`css-to-tailwind/CssToTailwind.tsx:335`.

Meanwhile `snippets` and `prompt-templates` use `px-3 py-1.5 text-2xs` for the same role, and
`json-tools`/`yaml-tools`/`xml-tools` use idiom A in a differently-padded row. Same element, three
paddings, three type sizes. There is no `PaneHeader` component.

### F3 — 16 tools bypass the `Toolbar` primitive

These import no `Toolbar`/`ToolbarGroup` and hand-roll their top row:

`api-client`, `case-converter`, `color-converter`, `css-to-tailwind`, `csv-tools` (+`CsvAnalyze`),
`curl-to-fetch`, `diff-viewer`, `hash-generator`, `jwt-decoder`, `prompt-templates`, `snippets`,
`uuid-generator`, `markdown-editor/MarkdownPreview`, `mermaid-editor/MermaidPreview`, `placeholder`.

The consequence is measurable padding drift. Horizontal padding across tool chrome rows:

| Padding       | Occurrences                 |
| ------------- | --------------------------- |
| `px-4 py-2`   | 20 (the `Toolbar` contract) |
| `px-3 py-2`   | 19                          |
| `px-3 py-1.5` | 19                          |
| `px-3 py-1`   | 15                          |
| `px-4 py-3`   | 4                           |
| `px-2 py-*`   | 18                          |

`api-client/ApiClient.tsx:843` is the clearest case: it renders a hand-rolled
`flex flex-wrap items-center gap-2 border-b … px-3 py-2` inside `ToolLayout`'s `toolbar` slot —
`Toolbar` with `px-4`, one prop away, but 1 unit narrower than every neighbouring tool.

`case-converter` and `hash-generator` go further and put a **whole input form** (`p-4` + `TextArea`)
in the `toolbar` slot, which is a layout slot, not a content slot.

### F4 — `Panel` is dead code; 4 tools hand-roll its exact styling

`Panel.tsx` exists, has a test (`shared/__tests__/Panel.test.tsx`), and has **zero** consumers in
`src/tools` or `src/components/shell`. Its comment claims it replaces "the repeated
`rounded border border-[var(--color-border)] bg-[var(--color-surface)]` wrapper hand-rolled
throughout the tools" — which is still hand-rolled in `csv-tools/CsvAnalyze.tsx` (×2),
`prompt-templates/PromptTemplates.tsx`, and `api-client/components/CollectionsSidebar.tsx`.

Either adopt it or delete it. Shipping a tested component nobody uses is worse than either.

### F5 — `ToolLayout`'s `header` slot is dead; two tools reinvent it anyway

`header={...}` is used **zero** times. The tab strip supplies the tool name, which is the right call.
But `snippets/SnippetsManager.tsx:606` and `prompt-templates/PromptTemplates.tsx:1020` both render
their own `<h1 className="font-ui text-sm font-semibold">` inside a hand-rolled `<aside>` — so the
app _does_ have tools that show their own title, just not through the slot built for it, and not
through `ToolLayout` at all (neither tool uses it).

`api-client` is the third master–detail tool and takes yet a third approach: `ToolLayout fullBleed`
with the sidebar rendered as a sibling. Three master–detail tools, three shells.

### F6 — No keyboard-hint primitive

`⌘` appears in 55 places across 17 tool files. It is rendered three ways:

- Bare span: `<span className="text-2xs text-[var(--color-text-muted)]">⌘↵</span>`
  (`base64/Base64Tool.tsx:358`, `url-codec/UrlCodec.tsx:165`)
- Inside `title=` tooltips (most tools)
- A real `<kbd>` with border + surface + `font-mono` — but only in the shell, and duplicated between
  `shell/CommandPalette.tsx:546` (`text-[10px]`) and `shell/ShortcutsModal.tsx:54` (`text-[11px]`),
  which disagree with each other and both sit off the type scale.

### F7 — No shared split-pane; every split is a fixed 50/50

15 tools render side-by-side panes via `w-1/2` or `grid-cols-2`. **None** is resizable. The only
draggable divider in the app is `shell/NotesDrawer.tsx:592`. For a tool like `diff-viewer` or
`json-tools`, where one side is routinely much denser than the other, a fixed 50/50 is a real usability
cost, not just a consistency one.

### F8 — Icon size scale has drifted from the documented one

| `size=` | Uses |
| ------- | ---- |
| 12      | 65   |
| 13      | 54   |
| 14      | 29   |
| 15      | 22   |
| 11      | 10   |
| 10      | 9    |
| 16      | 5    |

`DESIGN_SYSTEM.md` documents 14/16 for toolbar icons and 20 for sidebar. Actual practice is 12/13,
with 10/11/15 sprinkled in. Six sizes for what should be two or three. The docs are wrong, not the
code — but nothing tells a contributor which of the six to pick.

### F9 — `Field` unadopted; 16 files hand-roll `<label>`

`Field` (label + control + hint/error) is imported by exactly one file
(`api-client/components/AuthTab.tsx`). Sixteen other files hand-roll `<label>` wrappers —
`prompt-templates` alone has 10, `image-tool` 6, `color-converter` 3. Label styling therefore
inherits all of F1's variance.

### F10 — Focus-ring convention has a minority dialect

The standard is `focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]` (56 uses).
A minority use `focus-visible:ring-1` / `focus-visible:ring-[var(--color-accent)]/60` /
`focus-visible:ring-inset` (~8 uses). These render differently — a ring, not the two-layer offset
shadow — so focus is visibly inconsistent between neighbouring controls.

### F11 — Primary-action discipline is uneven

`variant="primary"` per tool: 15 tools have exactly 1 (correct), **13 tools have 0**, and 5 have 2–4
(`prompt-templates` 4, `image-tool`/`snippets`/`uuid-generator`/`yaml-tools` 2).

Tools with zero primary action include `case-converter`, `color-converter`, `hash-generator`,
`jwt-decoder`, `regex-tester`, `timestamp-converter`, `refactoring-toolkit` — all live-computing
tools where "no button to press" is arguably correct. That should be a **stated rule**, not an
accident, so reviewers stop adding one.

### F12 — `DESIGN_SYSTEM.md` is materially stale

It is the document contributors are told to read first, and it currently misinforms them:

- Says tokens live in `src/index.css`; they live in `src/styles/tokens.css` (imported at `index.css:21`).
- Every colour value in its tables is wrong (`--color-bg` documented `#0a0a0a`, actual `#0a0f1c`).
- Prescribes `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`; the codebase uses
  `--focus-ring` (F10). The doc actively teaches the minority dialect.
- Documents `animate-[fade-in_150ms_ease-out]` — **zero** uses. Actual class is `animate-fade-in` (7 uses).
- No mention of `ToolLayout`, `DocumentToolbar`, `DocumentIdentity`, `Panel`, `Field`, `InlineInput`,
  `SearchInput`, `Dialog`, `Spinner`, `SegmentedControl` — i.e. most of the layer this plan is about.
- No mention of `text-2xs` (45 files use it) or the `--radius-*` / `--elevation-*` tokens.

### F13 — Assorted one-offs

- `prompt-templates/PromptTemplates.tsx:189` renders a `[ 03-PREVIEW ]` bracketed mono label — an
  idiom that exists nowhere else in the app.
- `curl-to-fetch/CurlToFetch.tsx:285` computes HTTP-method chip colours inline with `color-mix()` and
  a local `METHOD_COLORS` map; `api-client` has its own method-colour treatment. Two sources of truth
  for the same visual vocabulary.
- `csv-tools/CsvTools.tsx` renders sub-tools (`CsvTable`, `CsvAnalyze`, `CsvConvert`) that each carry
  their own `Toolbar`, producing stacked toolbars with no shared rule about which level owns what.

---

## 4. Target contract

The rule we are converging on, stated once so it can be reviewed against:

```
ToolLayout                        ← every tool, no exceptions
  toolbar: Toolbar | DocumentToolbar   ← chrome only. Never a form, never an editor.
    ToolbarGroup (+ separated)         ← action families
    ToolbarSpacer
  body:
    fullBleed  → SplitPane / editor panes, each with PaneHeader
    otherwise  → maxWidth-capped stack of Panel sections
```

Five new or revived primitives close every finding above:

| Primitive            | Status | Closes |
| -------------------- | ------ | ------ |
| `SectionLabel`       | new    | F1, F9 |
| `PaneHeader`         | new    | F2     |
| `Panel`              | revive | F4     |
| `Kbd`                | new    | F6     |
| `SplitPane`          | new    | F7     |
| `MasterDetailLayout` | new    | F5     |

Plus one non-component deliverable: a **scale decision** (F8, F10) recorded in `DESIGN_SYSTEM.md`
and enforced by lint where possible.

---

## 5. Plan

Phases are ordered so that each one is independently shippable and reviewable. Do not batch them into
one PR — F1 alone touches ~25 files.

### P0 — Baseline and guardrails ✅

- [x] Record the current gate results in §6. All four green at `19af685`.
- [ ] ~~Screenshot every tool at 1280×800 and 900×700 via the native harness.~~ **Not done — blocked.**
      Capturing 30 tools requires navigating between them, and clicks/typing into the WebView are
      not scriptable on macOS (`documentation/NATIVE_UI_HARNESS.md`); only screenshot and resize
      are. A screenshot of whichever tool happens to be open is not a baseline. This is a real gap
      in the plan's verification story and it is not closed by anything below — the mitigation is
      that P3's sweeps are pure substitutions with unchanged DOM structure, and that P4/P5 are
      per-tool commits reviewable in isolation.
- [ ] ~~Append visual-only findings as F14+.~~ Superseded by the above.

**Acceptance:** all four gates green and recorded ✅; screenshot baseline **not achieved** — see above.

### P1 — Decide the scale, fix the docs ✅

- [x] **Label scale** decided: idiom A —
      `font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`.
- [x] **Icon scale** decided: `12` dense/inline, `14` toolbar, `16` navigation. 10/11/13/15 retired.
      Applied app-wide: 10,11→12; 13→14; 15→16.
- [x] **Chrome padding** decided: `px-4 py-2` tool toolbar, `px-3 py-1.5` pane header.
- [x] **Off-scale type** retired: `text-[9px]`/`text-[10px]`→`text-2xs`, `text-[11px]`→`text-xs`.
- [x] **Focus** resolved. The four `focus-visible:ring-*` sites turned out not to be drift — they
      are _inset_ rings in dense containers (sidebar rows, tab strip) where the outer ring clips.
      Added `--focus-ring-inset` to `tokens.css` and moved them onto it, rather than forcing them
      onto a treatment that would render wrong. Also fixed `SnippetsManager`'s
      `shadow-[inset_var(--focus-ring)]`, which only inset the _first_ of the token's two shadow
      layers — a real bug the audit surfaced by accident.
- [x] `DESIGN_SYSTEM.md` rewritten against source. The per-theme colour tables are gone: the app
      ships 22 themes, so a two-column dark/light table was wrong 20 ways and encouraged
      contributors to copy literal values. Documents roles instead.
- [x] `scripts/lint-design-system.mjs` + `bun run lint:ds`, chained into `bun run lint`.

**Scope note:** the scale sweep deliberately extended past `src/tools` into `src/components/shell`
(49 of the 153 violations). A design scale the shell is exempt from is not a scale. Structural work
in §5 P4/P5 remains tool-only per §8.

**Acceptance:** ✅ gate fails on a deliberate `text-[9px]`, passes on the swept tree; every
`DESIGN_SYSTEM.md` claim re-derived from source.

### P2 — Land the primitives ✅

All six landed with tests, `DESIGN_SYSTEM.md` entries, and zero call sites changed.

- [x] `SectionLabel` — `{ children, as, hint }`. `as` decouples heading level from visual.
- [x] `PaneHeader` — `{ title, hint, status, actions }`. `actions` is the slot all five
      hand-rolled copies lacked, which is why `CopyButton` placement wandered.
- [x] `Kbd` — `{ keys }`, `mod` resolved per platform via `usePlatform()`.
- [x] `SplitPane` — draggable + **keyboard-resizable** (arrows/Home/End/Enter-to-reset),
      `role="separator"` with `aria-valuenow`, ratio persisted under `cockpit.split.<key>`.
- [x] `MasterDetailLayout` — `{ sidebar, title, subtitle, sidebarActions, sidebarOpen, onToggleSidebar }`.
- [x] `Panel` — kept as-is (its existing API already fits the four hand-rolled sites).

**Acceptance:** ✅ 114 test files / 1338 tests passing (was 109/1314); `SplitPane` keyboard resize,
clamping, and persistence all covered.

### P1 — Decide the scale, fix the docs

No code changes to tools. This phase exists so P2–P5 have something to converge _on_.

- [ ] Decide and record the **label scale**: one `SectionLabel` with at most two variants. Proposal:
      `font-ui text-2xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`
      (idiom A — already the plurality at 6 uses and the only one that is `font-ui`, matching the
      chrome/mono split the design system already draws).
- [ ] Decide the **icon scale**: proposal — `12` dense/inline, `14` toolbar, `16` navigation. Retire
      10/11/13/15.
- [ ] Decide the **chrome padding scale**: `px-4 py-2` for tool toolbars (the existing `Toolbar`
      contract), `px-3 py-1.5` for pane headers. Retire `px-3 py-1`, `px-3 py-2`, `px-4 py-3` from
      chrome rows.
- [ ] Rewrite `DESIGN_SYSTEM.md` against reality — every item in F12. Regenerate the colour tables
      from `src/styles/tokens.css` rather than retyping them, so they cannot drift again.
- [ ] Add an ESLint rule or a `bun run lint:ui` grep gate rejecting: hardcoded `text-[Npx]`,
      `focus-visible:ring-*` in `src/`, and raw hex/`rgb()` in `className`.

**Acceptance:** `DESIGN_SYSTEM.md` claims verified line-by-line against source; the new gate fails on
a deliberately-introduced `text-[9px]` and passes on `main`.

### P2 — Land the primitives

Each with a test, a `DESIGN_SYSTEM.md` entry, and **zero call sites changed** in this phase.

- [ ] `SectionLabel` — `{ children, as?: 'span' | 'h2' | 'h3', hint?: ReactNode }`. Renders the P1
      scale. `as` exists so the visual and the heading level can be chosen independently — several
      current call sites are `<h2>` where a `<span>` is correct, and vice versa.
- [ ] `PaneHeader` — `{ title, actions?, status? }`. The F2 string, once, at the P1 padding.
      `actions` is the slot the five copies currently lack, which is why `CopyButton` placement
      varies pane to pane.
- [ ] `Kbd` — `{ keys: string }`, e.g. `<Kbd keys="mod+enter" />`, resolving `mod` via
      `usePlatform()`. Replaces the two disagreeing shell copies and the bare spans.
- [ ] `SplitPane` — `{ children: [ReactNode, ReactNode], direction?, defaultRatio?, storageKey? }`.
      Draggable divider with `role="separator"` + `aria-orientation` + arrow-key resize. Lift the
      drag logic out of `shell/NotesDrawer.tsx:592` rather than writing it twice.
- [ ] `MasterDetailLayout` — `{ sidebar, children, sidebarWidth?, collapsible? }`. The shell shared by
      `snippets`, `prompt-templates`, and `api-client`.
- [ ] `Panel` — keep as-is; add the `SectionLabel`-based header. Its API already fits the four
      hand-rolled sites.

**Acceptance:** each primitive has a unit test covering its ARIA contract; `SplitPane` has a
keyboard-resize test; bundle size delta recorded.

### P3 — Convergence sweep: labels, panes, keys

The mechanical bulk. Split into 3–4 PRs by finding, not by tool, so review stays diffable.

- [ ] **F1:** replace all 7 label idioms with `SectionLabel`. ~25 files. Watch for the `<h2>`/`<span>`
      distinction — do not silently change heading structure, it is a11y-visible.
- [ ] **F2:** replace the 5 verbatim pane headers plus the `snippets`/`prompt-templates`/`json-tools`
      family variants with `PaneHeader`.
- [ ] **F6:** replace the 55 `⌘` sites with `Kbd`; delete the two shell copies. Keep `title=` tooltips
      as-is where they are the only affordance.
- [ ] **F9:** adopt `Field` in the 16 hand-rolled `<label>` files. If `Field`'s API does not fit a
      site, extend `Field` — do not fork.
- [ ] **F10:** convert the ~8 `focus-visible:ring-*` sites to `--focus-ring`.
- [ ] **F8:** normalise icon sizes to the P1 scale.
- [ ] **F13:** delete the `[ 03-PREVIEW ]` idiom; extract HTTP-method colours into one shared map used
      by both `curl-to-fetch` and `api-client`.

**Acceptance:** grep for each retired class string returns zero hits in `src/tools`; the P1 lint gate
passes; visual diff against the P0 screenshots shows only intended changes.

### P4 — Structural convergence

Higher-risk, one PR per tool group.

- [ ] **F3 (chrome):** move the 16 bypassing tools onto `Toolbar`/`ToolbarGroup`. Start with
      `api-client` — it is the closest (a hand-rolled row that is one prop from correct) and the most
      visible.
- [ ] **F3 (slot abuse):** move `case-converter` and `hash-generator`'s input forms out of the
      `toolbar` slot into the body. These two will look different afterwards; that is the point.
- [ ] **F5:** move `snippets`, `prompt-templates`, and `api-client` onto `MasterDetailLayout`
      wrapped in `ToolLayout`. Decide at this point whether the `ToolLayout.header` slot earns its
      keep — if `MasterDetailLayout` owns the sidebar title, delete the slot (F5 says it is dead).
- [ ] **F4:** adopt `Panel` at the 4 hand-rolled sites, and for the section stacks in
      `uuid-generator` and `color-converter` (currently bare `<section>` + `<h2>`).
- [ ] **F13 (csv):** define which level owns the toolbar in `csv-tools` and collapse the stacked
      toolbars accordingly.

**Acceptance:** all 30 tools render through `ToolLayout`; `grep -L ToolLayout src/tools/*/[A-Z]*.tsx`
returns only sub-components; no tool has more than one chrome row unless it uses `Toolbar` twice
deliberately.

### P5 — Behaviour and polish

- [ ] **F7:** adopt `SplitPane` in the 15 fixed-50/50 tools, persisting ratio per tool via
      `storageKey`. Prioritise `diff-viewer`, `json-tools`, `markdown-editor`, `regex-tester`.
- [ ] **F11:** write down the primary-action rule ("live-computing tools have no primary action;
      action-triggered tools have exactly one"), then fix the 5 tools with 2+.
- [ ] **F12 follow-up:** re-verify `DESIGN_SYSTEM.md` against the post-P4 code and add a short
      "adding a new tool" checklist pointing at the target contract in §4.
- [ ] Re-shoot the P0 screenshots and diff. Attach the before/after to the final PR.

**Acceptance:** all four gates green; screenshot diff reviewed; `DESIGN_SYSTEM.md` re-verified.

---

## 6. Current snapshot

Baseline recorded 2026-08-19 at `19af685`, all from `apps/cockpit` (never the monorepo root).

| Gate       | Command                          | Baseline         | After P2         |
| ---------- | -------------------------------- | ---------------- | ---------------- |
| TypeScript | `npx tsc --noEmit`               | Pass             | Pass             |
| Tests      | `bunx vitest run`                | 109 files / 1314 | 114 files / 1338 |
| ESLint     | `bun run lint`                   | Pass, 0 warnings | Pass, 0 warnings |
| Design sys | `bun run lint:ds`                | 153 violations   | 0 violations     |
| Rust       | `cargo check` (from `src-tauri`) | Pass             | Pass (untouched) |

Re-run and update this table at the end of every phase.

---

## 7. Per-tool worklist

`T` = `Toolbar` adoption (F3) · `L` = `SectionLabel` (F1) · `P` = `PaneHeader` (F2) ·
`S` = `SplitPane` (F7) · `K` = `Kbd` (F6) · `F` = `Field` (F9) · `N` = `Panel` (F4) ·
`M` = `MasterDetailLayout` (F5)

| Tool                  | Work        | Notes                                                    |
| --------------------- | ----------- | -------------------------------------------------------- |
| api-client            | T L P S K M | Hand-rolled `px-3 py-2` row; third master–detail shell   |
| base64                | K S         | Already exemplary — use as the reference implementation  |
| case-converter        | T L S       | Input form lives in the `toolbar` slot                   |
| code-formatter        | K           | `DocumentToolbar` user; near-clean                       |
| color-converter       | T L N F     | `text-[9px]` off-scale; `font-mono` `<h2>` sections      |
| css-specificity       | P L         | Verbatim pane-header copy                                |
| css-to-tailwind       | T P S       | Verbatim pane-header copy; no `Toolbar`                  |
| css-validator         | L K         | `<h2>` label idiom E                                     |
| csv-tools (+3 subs)   | T L N       | Stacked sub-tool toolbars; 2 hand-rolled panels          |
| curl-to-fetch         | T P S       | Inline `color-mix` method chip → shared map              |
| diff-viewer           | T S K       | Highest-value `SplitPane` target                         |
| docs-browser          | —           | Clean                                                    |
| hash-generator        | T L S       | Input form in the `toolbar` slot                         |
| html-validator        | L K         | Label idioms A + E in one file                           |
| image-tool            | L F         | 5× idiom B; 6 hand-rolled labels; 3 raw `<button>`       |
| json-schema-validator | L S K       | 2× idiom A                                               |
| json-tools            | L S K       | 3 raw `<button>`; prime `SplitPane` target               |
| jwt-decoder           | T L S       | No `ToolLayout` toolbar at all                           |
| markdown-editor       | S K         | `SelectionContextToolbar` user; otherwise clean          |
| mermaid-editor        | S K         | Clean chrome                                             |
| placeholder           | —           | Trivial                                                  |
| prompt-templates      | T L P S M F | Worst offender: `[ 03-PREVIEW ]`, 10 labels, 4 primaries |
| refactoring-toolkit   | L K         | Clean chrome                                             |
| regex-tester          | P S         | Verbatim pane-header copy                                |
| snippets              | T L P S M K | Own `<h1>`; no `ToolLayout`                              |
| timestamp-converter   | L           | Second chrome row hand-rolled at `px-4 py-3`             |
| ts-playground         | L K         | —                                                        |
| url-codec             | T P S K     | Verbatim pane-header copy; bare `⌘↵` span                |
| uuid-generator        | T L N       | 4× `font-mono text-sm` `<h2>`; 2 primaries               |
| xml-tools             | L K         | 1 raw `<button>`                                         |
| yaml-tools            | L K         | 3 raw `<button>`; 2 primaries                            |

---

## 8. Out of scope

- Shell chrome (`Sidebar`, `TitleBar`, `StatusBar`, `CommandPalette`, `SettingsPanel`,
  `NotesDrawer`) — except where P2 lifts code _out_ of it (`SplitPane` from `NotesDrawer`, `Kbd` from
  `CommandPalette`/`ShortcutsModal`).
- Theming and the token set itself. Tokens are sound; this programme changes how tools _consume_
  them, not what they are.
- Any change to tool behaviour, parsing, or output. This is chrome only.
- New tools. The Cron Parser gap tracked previously is still open and unaffected by this work.

## 9. Risks

- **P3 is a wide mechanical diff.** ~25 files of class-string replacement is exactly the shape of
  change where a subtle regression hides. Mitigation: the P0 screenshots, and splitting P3 by
  finding rather than by tool so each diff is one substitution repeated.
- **Tests assert on class strings in places.** Expect breakage in `src/components/shared/__tests__`
  and in tool tests that query by styled text. Prefer fixing the test to assert on role/text over
  re-asserting the new class string.
- **`SplitPane` (P5) changes layout maths in 15 tools** and is the only phase touching behaviour.
  It is last for that reason and can be dropped without invalidating P1–P4.
