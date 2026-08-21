# TODO — Cockpit UI Audit Backlog

Last updated: 2026-08-21
Branch: `chore/ui-audit-todo-refresh`
Baseline commit: `2137e4e`

This file was reset on 2026-08-21. The previous document tracked the **Tool UI Consistency
Programme** (P0–P5), which is **complete** — all six primitives landed, every tool renders through
`ToolLayout` or `MasterDetailLayout`, the design scale is enforced by `bun run lint:ds`, and
`DESIGN_SYSTEM.md` was re-verified against source. See git history for `documentation/TODO.md` at
`8f4798f` for the closure notes. One item from it survives here as **S3** (screenshot baseline,
still blocked on manual capture).

**Scope of this document:** a fresh audit covering what the consistency programme deliberately
excluded — behaviour, correctness, accessibility, and missing capability — across all 30 tools plus
the app shell.

---

## 1. Method

Eight parallel static audits on 2026-08-21 at `2137e4e`, one per tool group (`code`, `data`, `web`,
`convert`, `test`, `network`, `write`) plus one for the shell (`src/app`, `src/components`,
`src/stores`, `src/hooks`, `src/styles`). Each read its scoped tools in full alongside
`src/components/shared/**`, `src/styles/tokens.css`, `STYLE_GUIDE.md` and `DESIGN_SYSTEM.md`.

Raw agent output was then **triaged by hand**. Findings that survived verification appear below;
findings that did not are recorded in §6 so they are not re-raised. Roughly a quarter of the raw
findings were false positives — treat §6 as the more useful half of this document.

Like the previous audit, this is static analysis. No runtime or visual inspection was performed —
see **S3**.

---

## 2. Baseline gates

All four green at `2137e4e`, run from `apps/cockpit` (never the monorepo root).

| Gate       | Command                          | At `2137e4e`           | After batches 1–4         |
| ---------- | -------------------------------- | ---------------------- | ------------------------- |
| TypeScript | `npx tsc --noEmit`               | Pass, no errors        | Pass, no errors           |
| Tests      | `bunx vitest run`                | 118 files / 1432 tests | 119 files / 1481 tests    |
| ESLint     | `bun run lint`                   | Pass, 0 warnings       | Pass, 0 warnings          |
| Design sys | `bun run lint:ds`                | 0 violations           | 0 violations              |
| Rust       | `cargo check` (from `src-tauri`) | Untouched              | Untouched — frontend only |

Re-run and update after each phase.

**Delivered in this branch:** all of §3 (C1–C6) and the S1/S2/S4 items of §5. **Not delivered:**
§4's capability gaps (G1–G6), which change behaviour rather than presentation and each want their
own PR and test plan; and **S3**, still blocked on manual capture.

---

## 3. P1 — Correctness and accessibility

These are defects. Each was verified against source before being written down.

### C1 — `EmptyState` descriptions render at ~36% opacity (app-wide contrast failure)

`src/components/shared/EmptyState.tsx:34,39` — the container sets
`text-[var(--color-text-muted)]`, which is already `rgba(…, 0.6)` in `tokens.css:10`. The
description `<p>` then adds `opacity-60` on top. Effective alpha is **0.36**, which fails WCAG AA
against every one of the 22 themes.

This is the shared primitive, so it affects **every** empty state in the app. Four tools also
hand-roll the same compounding in their own empty bodies:

- `code-formatter/CodeFormatter.tsx:425`
- `ts-playground/TsPlayground.tsx:420`
- `refactoring-toolkit/RefactoringToolkit.tsx:587`
- `shell/CommandPalette.tsx:674`

Plus `shell/NotesDrawer.tsx:701`, where the drag handle stacks `opacity-60` on muted text but
recovers on focus/hover — lower severity, same root cause.

- [x] ~~Introduce a `--color-text-subtle` token (a genuinely dimmer _solid_ value per theme).~~
      **Rejected on measurement.** Ratios were computed for all 23 theme blocks: muted-on-bg is
      5.21–7.37:1 (passes AA everywhere) and muted+`opacity-60` is 2.42–3.55:1 (fails everywhere).
      A token dimmer than muted would recreate the failure by design. Hierarchy now comes from the
      title being `--color-text` instead, which needs no new token and no per-theme judgement.
- [x] Remove `opacity-60` from `EmptyState` and the five sites above, plus three more the sweep
      surfaced (`Base64Tool` ×2, `MermaidPreview`).
- [x] Extend `scripts/lint-design-system.mjs` with a `dimmed-muted-text` rule. Variant-prefixed
      opacity (`disabled:`, `group-hover:`, `opacity-0`) is exempt — see `DESIGN_SYSTEM.md`.

**Acceptance:** ✅ contrast ≥ 4.5:1 on all 23 themes, computed rather than eyeballed; ✅ linter
rejects a deliberate re-introduction, covered by unit tests over the rule itself.

**Note:** the linter is line-based, so it catches same-line compounding only. The `EmptyState` case
— muted on the parent, `opacity-60` on the child — is invisible to it and was found by reading.
That limit is why the component test asserts the absence directly.

### C2 — `css-to-tailwind` emits invalid classes for `!important` values

`src/tools/css-to-tailwind/CssToTailwind.tsx:292,296,300,310` — values are interpolated verbatim
into arbitrary-value brackets. `color: red !important` becomes `text-[red !important]`, which is not
a valid Tailwind class. Grep confirms the string `important` appears **nowhere** in the tool, so
there is no stripping path anywhere.

- [x] `!important` is now stripped before anything else looks at the value, and re-applied as
      Tailwind **v4**'s _trailing_ `!` (`text-[red]!`). The finding above says `!text-[red]`, which
      is the v3 syntax — v4 moved it to a suffix, so check the installed version before touching
      this.
- [x] Scope correction: this affects **every** property, not the four listed. `!important` corrupts
      the value before any `PROPERTY_MAP` lookup or size/spacing equality check, so
      `width: 100% !important` missed the `w-full` shortcut too.
- [x] The unconvertible list still echoes the user's original declaration, `!important` included —
      echoing the stripped value back would misrepresent their input in the one list they read to
      find out what went wrong.
- [x] Seven fixture tests: mapped class, arbitrary colour, size value, keyword shortcut, whitespace
      before `important`, an ordinary declaration left unmarked, and the unconvertible echo.

**Acceptance:** ✅ every emitted class parses as valid Tailwind; ✅ `!important` intent is preserved
rather than silently dropped.

### C3 — Off-scale icons at `size={9}`

P1 of the previous programme retired 10/11/13/15 and declared the scale 12/14/16. Four `size={9}`
sites survived because the design-system linter checks class strings, not JSX props:

- `src/components/shell/NotesDrawer.tsx:806` (tag chip)
- `src/components/shell/ThemePicker.tsx:134` (selected check)
- `src/tools/snippets/SnippetsManager.tsx:788,1001` (folder, clear)

- [x] Moved all four to `size={12}`, the documented dense/inline value.
- [x] Added `9` to the existing `off-scale-icon` rule. The rule already covered 10/11/13/15 — `9`
      was simply missing from the alternation, which is the whole reason these four survived.

**Acceptance:** ✅ zero `size={9|10|11|13|15}` in `src/`; ✅ linter enforces it, with unit tests
covering both the rejected and the allowed sizes.

Landed in Batch 1 rather than Batch 2: the new rule turns these four into gate failures, so they
had to move in the same commit that added it.

### C4 — Live regions missing on regex match results

`src/tools/regex-tester/RegexTester.tsx:384-386,392-431` — the highlighted-match pane and match
detail list update as the user types, with no `aria-live`. A screen-reader user gets no feedback
that the match count changed.

- [x] Added one `sr-only` `role="status" aria-live="polite"` region at the top of the tool, fed by a
      new exported `describeMatches()`. Both existing visual counts stay non-live.
- [x] Announced as a sentence, not a number: "2 matches, 4 capture groups", "No matches", "Pattern
      error: …". A bare `2` tells a listener nothing about what changed.

Deviation from the plan above: `aria-live` went on a dedicated hidden region rather than on the
match-details container, because that container only renders when `matchCount > 0` — a live region
that unmounts cannot announce the transition to zero matches, which is exactly the case a user
needs to hear. The error and no-match paths announced nothing at all before.

**Acceptance:** ✅ exactly one live region announces match count, asserted directly
(`document.querySelectorAll('[aria-live]')` has length 1); `describeMatches` unit-tested across all
six branches.

### C5 — Accessibility gaps in `api-client` and the shell

- [x] ~~`api-client/ApiClient.tsx:1096-1101` — bare checkbox announced unnamed.~~ **Rejected — it
      already carries `aria-label={`Send header ${h.key || i + 1}`}`.** Swept all eight
      `type="checkbox"` sites in `src/` while verifying: every other one is wrapped in a `<label>`,
      and `RefactoringToolkit`'s takes an `ariaLabel` prop. There is no unnamed checkbox in the
      codebase. Left as native inputs — `Toggle` is a 32px `role="switch"`, wrong for a dense
      per-row enable.
- [x] `app/providers.tsx` — the top-level error state's bare `<button>` is now
      `<Button variant="secondary">`, and the error text is now an `Alert variant="error"`, so the
      whole-app failure case has `role="alert"` instead of being a silent, empty-looking window.
- [x] `shell/Workspace.tsx:60` — Suspense fallback now uses `<Spinner size="md">`. The loading state
      at `app/providers.tsx` was not in fact a hand-rolled spinner, just unlabelled text; it now
      pairs a `Spinner` with it so the state has a `role="status"`.
- [x] `tools/timestamp-converter/TimestampConverter.tsx` — `aria-label` on the `datetime-local`
      picker, and on the free-text input beside it, which was relying on its placeholder.

**Acceptance:** ✅ no unnamed form control in the tool or shell layer; ✅ `Spinner` is the only
hand-rolled spinner remaining — every other `animate-spin` in `src/` is a Phosphor `SpinnerIcon`,
which is an icon rather than a competing primitive.

### C6 — Silent error swallowing in `ui.store`

`src/stores/ui.store.ts` — `.catch(() => {})` handlers. Persistence failures vanish, so a workspace
that fails to save looks identical to one that saved.

Count corrected on inspection: **three**, not five — `persistTabs` held two and `discardClosedState`
one. The other two line numbers in the original finding were stale.

- [x] The two in `persistTabs` now report through `addToast`, the same path the other eight stores
      already use, with the message naming the consequence ("Open tabs may not be restored") rather
      than just the failure.
- [x] Coalesced: every tab click persists, so an outage would have raised a toast per click. One
      report per outage, re-armed by the next successful write.
- [x] `discardClosedState`'s handler logs rather than toasts. Deliberate — a leftover row keyed to a
      tab id that can never recur is invisible to the user, so a toast would be noise; a silent
      `catch` was still wrong.

**Acceptance:** ✅ a forced persistence rejection surfaces to the user; four tests cover the toast,
the coalescing, the re-arm after recovery, and the silence of the happy path.

---

## 4. P2 — Capability gaps

Ranked by how often a working developer hits them. Each was grep-verified as genuinely absent, not
merely unfound.

### G1 — `jwt-decoder` cannot verify a signature

No `verify`, `subtle`, or `HMAC` reference exists in the tool. It decodes and displays the
signature but cannot tell the user whether it is valid — which is the question most people open a
JWT tool to answer.

- [ ] Optional secret input; verify HS256/384/512 via WebCrypto `subtle.verify`.
- [ ] `alg: "none"` warning — currently accepted silently, and it is a genuine security footgun.
- [ ] Validate `nbf` the way `exp` is already validated (live, with a status badge).

### G2 — `hash-generator` is text-only

No `File` or drop handling in the tool. Hashing a downloaded artefact — the common case — is
impossible.

- [ ] File drop + streaming hash, mirroring the pattern `base64` already implements.
- [ ] Add SHA-3-256/512 and BLAKE2b. MD5 and SHA-1 ship today and are both broken; offering only
      broken-or-SHA-2 is a thin menu.

### G3 — `timestamp-converter` has no timezone picker

`TimestampConverter.tsx:54` resolves the _local_ zone via `Intl` and nothing else. Converting a
timestamp into another zone — the reason the tool exists for anyone on a distributed team — is not
possible.

- [ ] Timezone selector driving the output list, defaulting to local.
- [ ] ISO week format (`YYYY-Www`) in the output list.

### G4 — `markdown-editor` has no find/replace

No `mod+f`, `mod+h`, or find UI anywhere in the tool. For a full document editor this is a
conspicuous absence.

- [ ] Find/replace panel with `mod+f` / `mod+h`, scoped to the editor pane.

### G5 — `api-client` body modes are narrower than the importer

`lib/api-import.ts` recognises `form-data` and `x-www-form-urlencoded`, but `BODY_MODES` in the UI
exposes only JSON/Text/None. An imported collection can therefore hold a body the UI cannot
represent or edit.

- [ ] Add both modes to `BODY_MODES` with a key/value editor.
- [ ] File upload in multipart bodies.
- [ ] Export request as cURL — the inverse of `curl-to-fetch`, which already exists in the app.

### G6 — Smaller, well-scoped additions

- [ ] `url-codec` — recursive decode ("decode all levels") for double-encoded input, and bulk
      line-separated encode/decode.
- [ ] `csv-tools` — delimiter override reachable from Convert/Analyze views without returning to
      Table view first.
- [ ] `uuid-generator` — v5 (namespace/name) alongside the existing v1/v4/v7.
- [ ] `color-converter` — LAB/LCH output; OKLCH already ships.
- [ ] `image-tool` — rotate and flip.
- [ ] `refactoring-toolkit` — undo history beyond the single `lastApply` snapshot
      (`RefactoringToolkit.tsx:214`), with `mod+z`.
- [ ] `regex-tester` — a sample in `lib/tool-samples.ts`; it is one of the few tools without one.

---

## 5. P3 — Polish and convergence

Low risk, high volume. Batch by finding, not by tool — the same lesson as P3 of the last programme.

### S1 — Residual hand-rolled primitives

The consistency programme converted chrome; these are the stragglers it did not reach.

- [x] `ts-playground/TsPlayground.tsx` — both hand-rolled pane headers are now `PaneHeader`, with
      the line count folded into `hint` exactly as `diff-viewer/DiffViewer.tsx:200` does.
- [x] `regex-tester/RegexTester.tsx` — match-count badge → `StatusBadge`. Colour moves from accent
      to `info`, and to `warning` when the count is truncated, which the accent version could not
      express at all.
- [x] ~~`case-converter/CaseConverter.tsx` result cards → `Panel`.~~ **Rejected.** `Panel` is a
      titled, padded container; these cards are a single label/value/actions row, so the conversion
      needs `padded={false}` plus a className re-adding the padding — and `Panel` hardcodes
      `border-[var(--color-border)]`, so the selected card's accent border would have to win by
      className override, which is exactly the silent-loss trap documented in `DESIGN_SYSTEM.md`.
      **A real bug turned up while looking:** the card used a bare `border` with no colour utility.
      Tailwind v4's preflight is `border: 0 solid` with no colour set, so that resolves to
      `currentColor` — every unselected card was drawing a full-strength text-coloured outline
      instead of `--color-border`. Fixed by picking the colour in the existing ternary rather than
      listing both (two arbitrary border-colour utilities have equal specificity; the winner is
      generation order, not string order). Swept the rest of `src/` for the same shape — 21
      candidates, all others legitimate (`border-0`, `border-current`, or a colour supplied by a
      sibling variant map).
- [x] ~~`image-tool/ImageTool.tsx` raw `<button>` → `Button variant="ghost" size="xs"`.~~
      **Rejected.** All three already carry an `eslint-disable no-restricted-syntax` with the
      reasoning: they are 10px (`text-2xs`) annotations and `Button`'s smallest size is `text-xs`,
      which would outweigh the fields they label. The audit agent flagged them without reading the
      comment directly above each. They did lack a focus ring and `type="button"` — both added, so
      they now behave like `Button` where it matters.
- [x] `markdown-editor/modals/LinkModal.tsx` — checkbox → `Toggle`. A modal settings row has the
      space for a switch, unlike the dense per-row checkboxes in the validators.
- [x] `refactoring-toolkit` — `SAFETY_COLORS` (raw `var(...)` strings for an inline `style`) is now
      `SAFETY_TEXT_CLASSES`, className-only. The inline style bought nothing, since the values were
      already CSS variables, and cost variant states.

### S2 — Modal and breakpoint inconsistency in the Write group

Four tools, four different hardcoded widths and three different stacking breakpoints:

- Modal widths: `w-[400px]` (`LinkModal:44`), `w-[340px]` (`CodeBlockModal:61`),
  `w-[420px]` (`TableModal:47`) — none responsive, all break on a narrow window.
- Stack breakpoints: `max-[900px]` (`mermaid-editor:526`, `prompt-templates:526`),
  `max-[1000px]` (`snippets:834,960,1149`), `max-[900px]` (`xml-tools:511`).

- [x] **Done, and wider than written.** The audit named three modals; the real count was **18
      callers spending nine different width expressions**, because `Dialog` had no width of its own
      and every caller therefore had to invent one. Fixing the call sites would have left the hole
      open, so the width moved into the primitive: `Dialog` gained a `size` prop
      (`sm`/`md`/`lg`/`xl`/`none`, default `sm`) over a `w-[min(Xrem,calc(100vw-2rem))]` scale where
      every step subtracts the same gutter, so no dialog can exceed the viewport. All 18 callers
      migrated; 14 simply deleted their width. `none` exists for the two dialogs that size against
      the viewport in both axes (`EnvironmentModal`, the `HtmlValidator` popout) and manage it
      themselves. `className` now carries a doc comment saying not to set a width there — two
      arbitrary width utilities have equal specificity, so the winner is stylesheet _generation_
      order, not string order. Three tests in `Dialog.test.tsx` cover the default, the shared
      gutter across all four steps, and `none` setting no width at all.
- [x] **Done.** Recorded in `DESIGN_SYSTEM.md` § Breakpoints: **900px** stacks a split into a
      column, **1000px** is density (rows wrap, panes narrow, padding tightens). 900px was already
      consistent across 18 sites and needed no change. The only real drift was one site:
      `MasterDetailLayout.tsx:56` narrowed at **1100px** while its own line-50 comment claimed the
      value matched SnippetsManager — which has always used 1000px. The comment was the accurate
      half; the code was fixed to 1000px and the comment corrected to say so. Unifying downward was
      the safe direction: holding a pane at full width for an extra 100px band is never a
      regression, whereas wrapping rows earlier could be, and S3 blocks visual confirmation either
      way.
      Two departures are documented rather than flattened: `MarkdownEditor` and `ApiClient` stack at
      1000px on purpose (prose needs line length; a request/response pair is two forms), and the
      `min-[1100px]:grid-cols-N` in `CssValidator:609` / `HtmlValidator:768` is a rule-grid _column
      count_, not a layout mode, so it stays off the scale. `stackBelow` is now stated as the
      preferred form over a raw `max-[900px]:flex-col` — it keeps the query in one place and
      disables the drag handle with it, rather than leaving a dead 6px strip.

### S3 — Screenshot baseline (carried over, still blocked)

Inherited unchanged from the previous programme's P0 and P5. The Tauri WebView on macOS can be
screenshotted and resized by script but **not clicked or typed into**
(`documentation/NATIVE_UI_HARNESS.md`), so an agent cannot drive a tool into the state worth
photographing. This audit is static for the same reason.

- [ ] **Needs a human.** Capture all 30 tools at 1280×800 and 900×700, and again after C1 lands —
      C1 is a contrast change across every theme and is precisely what a screenshot diff would
      confirm and no automated gate will.

### S4 — Assorted single-site polish

- [x] `base64/Base64Tool.tsx` — Unicode `↺` → `ArrowCounterClockwiseIcon size={12}`.
- [x] `code-formatter/CodeFormatter.tsx` — save icon 16 → 14, matching its three toolbar siblings.
      The remaining 16 in that file is the `DocumentIdentity` icon, which is at navigation scale on
      purpose.
- [x] Both validators now use the conditional `aria-controls`. It was `html-validator` that was
      wrong, in **two** places, not one — both its panels are conditionally rendered, so the
      unconditional attribute pointed at a non-existent id whenever the disclosure was closed.
- [x] `yaml-tools/YamlTools.tsx` — expand/collapse-all now carry the same icons as their
      `json-tools` counterparts. Correction to the finding: the icons were _not_ already imported;
      lines 4-5 held different arrows. Added the imports.
- [x] `csv-tools/CsvTools.tsx` — `CopyButton` now names what it copies per view ("Copy JSON",
      "Copy SQL", "Copy CSV") instead of "Copy output" across all three.
- [x] `docs-browser/DocsBrowser.tsx` — a new exported `siteLabel()` derives the name from
      `frameSrc`, and the label, the "Open externally" href, the iframe `title` and all four copy
      strings now follow it. Previously only `src` did, so pointing the tool anywhere else produced
      chrome naming the wrong site — which the old test enshrined by asserting "DevDocs.io" while
      rendering `about:blank`.

---

## 6. Rejected findings

Raised by the audit, checked against source, **not real**. Recorded so they are not re-raised.

- **"`jwt-decoder` leaks a `setInterval` on unmount"** — False. `JwtDecoder.tsx:130-132` returns
  `clearInterval`.
- **"`api-client` history breaks on URLs containing spaces"** — False.
  `CollectionsSidebar.tsx:492-493` destructures with a rest spread then `urlParts.join(' ')`, which
  round-trips correctly.
- **"`api-client` history throws when the `·` delimiter is absent"** — False. `:514` reads
  `split('·')[1]?.trim() ?? ''` — optional chaining plus a fallback.
- **"`docs-browser` slow-load timeout leaks on error"** — False. `DocsBrowser.tsx:23-29` has correct
  cleanup and dependencies.
- **"`regex-tester` has no catastrophic-backtracking protection"** — False. A timeout guard exists;
  `RegexTester.tsx:119` reads `evaluation.status === 'timeout'`.
- **"`Panel` and `Field` are dead primitives"** — Stale. True before P4; `Panel` now has 2
  consumers, `Field` has 11.
- **"`diff-viewer` lacks word-level intra-line diff"** — Unfounded. It renders Monaco's
  `DiffEditor`, which does intra-line diffing itself.
- **Wrong path, right findings** — several agent findings cited `api-client/CollectionsSidebar.tsx`.
  The file is `api-client/components/CollectionsSidebar.tsx`; the line numbers were accurate.

---

## 7. Sequencing

1. **C1** first and alone. It touches a shared primitive and every theme, and it is the only item
   here that is a live accessibility failure rather than a latent one.
2. **C2, C3, C4, C5, C6** — independent, parallelisable, one commit each.
3. **S1, S4** — mechanical; batch by finding across tools so each diff is one substitution repeated.
4. **G1–G5** — one PR per tool. These change behaviour and each deserves its own tests.
5. **S2** needs a decision recorded in `DESIGN_SYSTEM.md` before any code moves.
6. **G6** is a grab-bag; pull items off it opportunistically when already inside the tool.

Both linter extensions (C1, C3) are worth landing with their findings rather than after — a scale
nothing enforces is a scale that drifts back, which is how the `size={9}` sites survived P1.

---

## 8. Out of scope

- New tools. The **Cron Parser** gap remains open and is unaffected by any of this.
- Theming and the token set, except C1's `--color-text-subtle` addition.
- The legacy T4 apps (`apps/next`, `apps/expo`, `apps/tauri`, `apps/docs`, `apps/cli`,
  `apps/vscode`, `packages/*`). See root `AGENTS.md`.
- Rust/`src-tauri`. This backlog is frontend-only.

## 9. Risks

- **C1 changes contrast in all 22 themes.** The one change here that most wants a visual diff is
  the one S3 blocks. Mitigation: compute contrast ratios numerically against the token values
  rather than trusting the eye.
- **G1's WebCrypto path is async** in a tool that is currently fully synchronous. Expect the
  loading-state and error-path work to exceed the verification logic itself.
- **Tests assert on class strings in places.** C1 and C3 will break some. Prefer fixing the test to
  assert on role/text over re-asserting the new class string — same guidance as last time.
