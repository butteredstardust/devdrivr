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

| Gate       | Command                          | Result                    |
| ---------- | -------------------------------- | ------------------------- |
| TypeScript | `npx tsc --noEmit`               | Pass, no errors           |
| Tests      | `bunx vitest run`                | 118 files / 1432 tests    |
| ESLint     | `bun run lint`                   | Pass, 0 warnings          |
| Design sys | `bun run lint:ds`                | 0 violations              |
| Rust       | `cargo check` (from `src-tauri`) | Untouched — frontend only |

Re-run and update after each phase.

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

- [ ] Introduce a `--color-text-subtle` token (a genuinely dimmer _solid_ value per theme) and use
      it for description text instead of compounding alpha.
- [ ] Remove `opacity-60` from `EmptyState` and the five sites above.
- [ ] Extend `scripts/lint-design-system.mjs` to fail on `opacity-<n>` combined with
      `text-[var(--color-text-muted)]` in one class string. This is exactly the class of bug the
      linter exists to catch and currently misses.

**Acceptance:** contrast ratio ≥ 4.5:1 for empty-state descriptions in the lightest and darkest of
the 22 themes; linter rejects a deliberate re-introduction.

### C2 — `css-to-tailwind` emits invalid classes for `!important` values

`src/tools/css-to-tailwind/CssToTailwind.tsx:292,296,300,310` — values are interpolated verbatim
into arbitrary-value brackets. `color: red !important` becomes `text-[red !important]`, which is not
a valid Tailwind class. Grep confirms the string `important` appears **nowhere** in the tool, so
there is no stripping path anywhere.

- [ ] Strip a trailing `!important` from the value before bracket interpolation, and append
      Tailwind's `!` importance prefix (`!text-[red]`) so the declaration's intent survives.
- [ ] Add fixture tests for each of the four affected properties.

**Acceptance:** every emitted class parses as valid Tailwind; `!important` intent is preserved
rather than silently dropped.

### C3 — Off-scale icons at `size={9}`

P1 of the previous programme retired 10/11/13/15 and declared the scale 12/14/16. Four `size={9}`
sites survived because the design-system linter checks class strings, not JSX props:

- `src/components/shell/NotesDrawer.tsx:806` (tag chip)
- `src/components/shell/ThemePicker.tsx:134` (selected check)
- `src/tools/snippets/SnippetsManager.tsx:788,1001` (folder, clear)

- [ ] Move all four to `size={12}`, the documented dense/inline value.
- [ ] Teach `lint:ds` to parse `size={…}` on `@phosphor-icons/react` elements and reject anything
      outside {12, 14, 16}. Without this the scale will drift again.

**Acceptance:** zero `size={9}`/`{10}`/`{11}`/`{13}`/`{15}` in `src/`; linter enforces it.

### C4 — Live regions missing on regex match results

`src/tools/regex-tester/RegexTester.tsx:384-386,392-431` — the highlighted-match pane and match
detail list update as the user types, with no `aria-live`. A screen-reader user gets no feedback
that the match count changed.

- [ ] Add `aria-live="polite"` to the match-details container.
- [ ] Announce the count via a single region only — the toolbar badge and the details pane must not
      both announce, which is the mistake P3/F2 already had to unpick in the schema validator.

**Acceptance:** exactly one live region announces match count; verified by a DOM assertion in the
test suite.

### C5 — Accessibility gaps in `api-client` and the shell

- [ ] `api-client/ApiClient.tsx:1096-1101` — bare `<input type="checkbox">` with no associated
      label; announced unnamed. Wrap in `Field` or the shared toggle treatment.
- [ ] `app/providers.tsx:218-228` — the top-level error state uses a bare `<button>` with no focus
      ring. Use `<Button variant="secondary">`.
- [ ] `shell/Workspace.tsx:59-60` — the Suspense fallback hand-rolls a 20px spinner div with no
      `role="status"` and no accessible label, while `src/components/shared/Spinner.tsx` exists and
      provides both. Same again at `app/providers.tsx:234`.
- [ ] `tools/timestamp-converter/TimestampConverter.tsx:201` — `datetime-local` input sits in the
      toolbar with no `Field` wrapper and no `aria-label`.

**Acceptance:** no unnamed form control in the tool or shell layer; `Spinner` is the only spinner.

### C6 — Silent error swallowing in `ui.store`

`src/stores/ui.store.ts:61,65,94,117,129` — five `.catch(() => {})` handlers. Persistence failures
vanish, so a workspace that fails to save looks identical to one that saved.

- [ ] Route these through the existing toast/error-reporting path rather than discarding.

**Acceptance:** a forced persistence rejection surfaces to the user.

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

- [ ] `ts-playground/TsPlayground.tsx:397-405,440-449` — two hand-rolled pane headers. `PaneHeader`
      exists; `diff-viewer/DiffViewer.tsx:196` shows the intended shape.
- [ ] `regex-tester/RegexTester.tsx:254-262` — hand-rolled match-count badge → `StatusBadge`.
- [ ] `case-converter/CaseConverter.tsx:154-183` — hand-rolled result cards → `Panel`.
- [ ] `image-tool/ImageTool.tsx:945-950,960-966,1071-1077` — raw `<button>` for aspect presets and
      resets → `Button variant="ghost" size="xs"`.
- [ ] `markdown-editor/modals/LinkModal.tsx:85-96` — hand-rolled checkbox.
- [ ] `refactoring-toolkit/RefactoringToolkit.tsx:537-541` — inline `style={{ color }}` where the
      values are already CSS variables; className-only.

### S2 — Modal and breakpoint inconsistency in the Write group

Four tools, four different hardcoded widths and three different stacking breakpoints:

- Modal widths: `w-[400px]` (`LinkModal:44`), `w-[340px]` (`CodeBlockModal:61`),
  `w-[420px]` (`TableModal:47`) — none responsive, all break on a narrow window.
- Stack breakpoints: `max-[900px]` (`mermaid-editor:526`, `prompt-templates:526`),
  `max-[1000px]` (`snippets:834,960,1149`), `max-[900px]` (`xml-tools:511`).

- [ ] Adopt a single responsive modal width, e.g. `w-[min(30rem,calc(100vw-2rem))]`.
- [ ] Settle on **one** stacking breakpoint, record it in `DESIGN_SYSTEM.md`, and prefer
      `SplitPane`'s `stackBelow` over raw Tailwind breakpoints where a split already exists.

### S3 — Screenshot baseline (carried over, still blocked)

Inherited unchanged from the previous programme's P0 and P5. The Tauri WebView on macOS can be
screenshotted and resized by script but **not clicked or typed into**
(`documentation/NATIVE_UI_HARNESS.md`), so an agent cannot drive a tool into the state worth
photographing. This audit is static for the same reason.

- [ ] **Needs a human.** Capture all 30 tools at 1280×800 and 900×700, and again after C1 lands —
      C1 is a contrast change across every theme and is precisely what a screenshot diff would
      confirm and no automated gate will.

### S4 — Assorted single-site polish

- [ ] `base64/Base64Tool.tsx:673` — Unicode `↺` where every sibling uses a Phosphor icon →
      `ArrowCounterClockwiseIcon size={12}`.
- [ ] `code-formatter/CodeFormatter.tsx:336` — save icon at 16 among 14s in the same toolbar.
- [ ] `css-validator/CssValidator.tsx:575` vs `html-validator/HtmlValidator.tsx:731` — the two
      validators set `aria-controls` differently (conditional vs unconditional) for the same
      disclosure. Pick the conditional form; an `aria-controls` pointing at an unrendered id is
      wrong.
- [ ] `yaml-tools/YamlTools.tsx:593-604` — expand/collapse-all buttons lack the icons their
      `json-tools` counterparts have, and the icons are **already imported** on lines 4-5.
- [ ] `csv-tools/CsvTools.tsx:414` — `CopyButton` label is always "Copy output" across three view
      modes; make it name what it copies.
- [ ] `docs-browser/DocsBrowser.tsx:43-44,85-101` — "DevDocs.io" and the iframe `title` are
      hardcoded while `frameSrc` is a prop.

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
