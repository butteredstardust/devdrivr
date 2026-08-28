# Cockpit Tools Audit

Status: complete
Scope: all 30 registered tools plus application shell, shared components, UI, and reuse patterns
Audit date: 2026-08-28

## Purpose

This audit records actionable defects, missing capabilities, code smells, and test gaps in the
Cockpit tools. It is intended to seed later improvement work, not to serve as a release gate.

## Executive summary

The audit found **69 actionable items**: 1 critical, 12 high, 43 medium, and 13 low. Existing tests
pass for the audited groups, but most findings exercise semantic equivalence, stale async work,
resource exhaustion, malformed input, or persistence failure paths that the current suites do not
cover.

The most urgent work is to stop Refactoring Toolkit from labelling behavior-changing transforms as
safe, repair `promise-to-async`, and introduce shared file/input/output resource budgets for tools
that materialize large data in renderer memory. The next tier is correctness: stale worker results,
lossy format conversion, parser edge cases, generated-code validity, and sensitive JWT retention.

## Evidence standard

A finding is included only when it identifies the affected tool and code location, explains the
failure mode or maintenance impact, and recommends a bounded next step. Suspicions that cannot be
confirmed from code or a focused verification are omitted.

Severity is assigned as follows:

- **Critical** — the tool can silently generate broken code, lose data, or create a security issue
  in an ordinary supported workflow.
- **High** — data loss, security exposure, materially incorrect output, or a primary workflow that
  can fail for ordinary input.
- **Medium** — incorrect behavior in a meaningful edge case, accessibility failure, significant
  performance risk, or fragile code likely to regress.
- **Low** — localized maintainability smell, weak error handling, or a non-critical missing feature
  with a clear user benefit.

## Remediation progress

Branch: `fix/cockpit-audit-remediation`

All 69 findings are implemented on this branch, in batches grouped by shared root cause rather than
one commit per finding. Per the implementation workflow for this branch, `tsc` and `lint` ran as
guardrails throughout and the full test suite was run once at the end.

| Batch | Findings                                   | Commit                                                         |
| ----: | ------------------------------------------ | -------------------------------------------------------------- |
|     1 | C-01…C-05                                  | make refactoring transforms semantics-safe                     |
|     2 | D-01, TST-01                               | preserve XML mixed content and bound zero-width regex scans    |
|     3 | CON-01                                     | enforce image decode and output pixel budgets                  |
|     4 | SH-01, SH-02, SH-05, SH-06                 | gate bootstrap, confirm dirty tab closes, dedupe execute       |
|     5 | CMP-01, CMP-02, ARC-01                     | contain palette focus, fix tab semantics, import parity        |
|     6 | CON-02…CON-08                              | correct conversion and generated-code semantics                |
|     7 | D-02, CMP-06, NET-01…NET-03, WRT-01…WRT-05 | add shared resource budgets and bounded traversal              |
|     8 | D-03, D-04, WEB-01…WEB-05                  | fix data and CSS/HTML analysis correctness                     |
|     9 | C-06…C-08, TST-02…TST-04                   | keep async output fresh and stop leaking JWT material          |
|    10 | SH-03, SH-04, SH-07                        | make window restore display-aware, resize gestures recoverable |
|    11 | CMP-03…CMP-05, CMP-07…CMP-13               | repair shared interaction primitives                           |
|    12 | UI-01…UI-05, ARC-03                        | give the shell's shared surfaces real widget semantics         |
|    13 | ARC-02, ARC-05                             | share the text-document file lifecycle, drop dead modes        |
| 14–16 | ARC-04                                     | split Settings, JSON Tools / API Client, and Markdown          |
|    17 | NET-04, NET-05                             | report what the Docs Browser probe saw; narrow the sandbox     |

## Coverage

| Tool group | Tools | Audit status |
| ---------- | ----: | ------------ |
| Code       |     4 | Audited      |
| Data       |     5 | Audited      |
| Web        |     4 | Audited      |
| Convert    |     9 | Audited      |
| Test       |     2 | Audited      |
| Network    |     2 | Audited      |
| Write      |     4 | Audited      |

## Application-wide coverage

| Area                               | Audit status |
| ---------------------------------- | ------------ |
| Application shell and lifecycle    | Audited      |
| Shared components and primitives   | Audited      |
| Cross-cutting UI and accessibility | Audited      |
| Reusability and duplication        | Audited      |

## Verification baseline

The audit did not modify product code. At completion on 2026-08-28:

- `bunx tsc --noEmit`: passed with zero errors.
- `bunx vitest run`: 135 files passed, 1,851 tests passed.

Passing tests do not invalidate the findings; the reported failure modes are largely absent from
the current suite and are called out in each recommendation.

## Findings

### Code

#### C-01 — `promise-to-async` loses promise-chain semantics

- **Severity:** Critical
- **Tool:** Refactoring Toolkit
- **Evidence:** `src/tools/refactoring-toolkit/transforms/index.ts:487`
- **Impact:** The generated `try` block invokes the `.then` callback as an expression statement;
  it neither awaits the callback nor preserves its returned value. For example, transforming
  `Promise.resolve(1).then(async () => { throw new Error('x') }).catch(handle)` makes the async
  rejection escape the generated `try/catch`, so `handle` is not called and the rejection can be
  unhandled.
- **Recommendation:** Transform only callback shapes that can be safely inlined, or generate an
  awaited callback while preserving its result. Add return-value and async-rejection golden tests.

#### C-02 — `var-to-const` is labelled safe but changes scope and hoisting

- **Severity:** High
- **Tool:** Refactoring Toolkit
- **Evidence:** `src/tools/refactoring-toolkit/transforms/index.ts:59`
- **Impact:** `if (ok) { var value = 1 } console.log(value)` is converted to a block-scoped
  declaration, making the later read throw. Reassignment detection is name-based rather than
  binding-aware, so a shadowed assignment can also select `let` for the wrong declaration.
- **Recommendation:** Mark the transform as caution and restrict it to declarations proven safe by
  scope/reference analysis; add block-hoist and shadowed-binding tests.

#### C-03 — `arrow-functions` is labelled safe but changes `this` and `arguments`

- **Severity:** High
- **Tool:** Refactoring Toolkit
- **Evidence:** `src/tools/refactoring-toolkit/transforms/index.ts:88`
- **Impact:** Converting an event-listener function that uses `this` changes `this` from the event
  target to the enclosing lexical value. The same problem applies to `arguments`, `super`, and
  `new.target`.
- **Recommendation:** Mark the transform as caution and skip functions containing dynamic-context
  constructs. Add semantic guard tests for every skipped construct.

#### C-04 — `strict-equality` is labelled safe despite changing coercive comparisons

- **Severity:** High
- **Tool:** Refactoring Toolkit
- **Evidence:** `src/tools/refactoring-toolkit/transforms/index.ts:324`
- **Impact:** The common nullish check `value == null` matches both `null` and `undefined`; the
  generated `value === null` does not. String/number comparisons can change similarly.
- **Recommendation:** Mark the transform as caution and either require compatible static operand
  types or leave general comparisons unchanged. Cover nullish and cross-type comparisons.

#### C-05 — identifier rename can create collisions and invalid code

- **Severity:** Medium
- **Tool:** Refactoring Toolkit
- **Evidence:** `src/workers/refactoring.api.ts:27`
- **Impact:** Rename is identifier-name based rather than binding-aware. Renaming `before` to
  `after` in a scope that already declares `after` produces duplicate declarations, and users
  cannot target one lexical binding when the same name is shadowed.
- **Recommendation:** Resolve lexical bindings and reject destination collisions, or explicitly
  present the operation as a global identifier rewrite. Add collision and shadowing tests.

#### C-06 — Diff Viewer can publish a stale patch after the inputs change

- **Severity:** Medium
- **Tool:** Diff Viewer
- **Evidence:** `src/tools/diff-viewer/DiffViewer.tsx:340`
- **Impact:** A completed worker request commits its captured patch without checking a request ID or
  the current state. Editing either side while a large comparison runs can leave the old patch and
  export actions visible beneath the new inputs until the next comparison completes.
- **Recommendation:** Invalidate a monotonically increasing request generation on every relevant
  input or option change, and commit only the latest generation. Add a deferred-worker race test.

#### C-07 — TypeScript Playground exposes stale output during its debounce window

- **Severity:** Medium
- **Tool:** TypeScript Playground
- **Evidence:** `src/tools/ts-playground/TsPlayground.tsx:142`,
  `src/tools/ts-playground/TsPlayground.tsx:183`
- **Impact:** The request counter advances only when the next debounced compile starts. An older
  compile can therefore publish diagnostics and exportable JavaScript after the editor or compiler
  options have changed.
- **Recommendation:** Invalidate the current generation synchronously when inputs/options change,
  and suppress export while output is stale. Add a deferred-worker test.

#### C-08 — Code Formatter can drop an auto-format request while busy

- **Severity:** Medium
- **Tool:** Code Formatter
- **Evidence:** `src/tools/code-formatter/CodeFormatter.tsx:182`,
  `src/tools/code-formatter/CodeFormatter.tsx:242`
- **Impact:** If the user edits while formatting is in flight, the new debounced call exits because
  the formatter is busy. The old job then detects stale input and exits without scheduling the
  newest input, so auto-format remains skipped until another edit occurs.
- **Recommendation:** Record a dirty/pending generation while busy and schedule one final format of
  the newest input. Cover the delayed-worker/edit-during-job sequence.

### Data

#### D-01 — XML to JSON silently drops mixed-content text

- **Severity:** High
- **Tool:** XML Tools
- **Evidence:** `src/workers/xml.api.ts:323`, `src/tools/xml-tools/XmlTools.tsx:908`
- **Impact:** Text is emitted as `#text` only when the element has no child elements. Converting
  `<p>before<b/>after</p>` therefore returns `{ "b": "" }`, losing both text segments; converting
  that JSON back to XML permanently changes the document.
- **Recommendation:** Represent ordered mixed content explicitly and support the representation in
  both directions, or reject/warn clearly when an element contains meaningful text or CDATA beside
  child elements. Add mixed-content and CDATA round-trip tests.

#### D-02 — JSON statistics and key sorting recurse without resource bounds

- **Severity:** Medium
- **Tool:** JSON Tools
- **Evidence:** `src/tools/json-tools/JsonTools.tsx:146`,
  `src/tools/json-tools/JsonTools.tsx:159`
- **Impact:** Immediately after parsing, status/statistics recursively traverse the complete value;
  Sort Keys uses a separate unbounded recursive walk. Sufficiently deep valid JSON can overflow the
  stack or freeze the UI, while the equivalent YAML statistics path already has traversal budgets.
- **Recommendation:** Use one iterative or depth/visit-bounded walker for statistics and sorting,
  expose a clear “too deeply nested/large” state, and add deep adversarial fixtures.

#### D-03 — CSV table state can leak across distinct schemas

- **Severity:** Medium
- **Tool:** CSV Tools
- **Evidence:** `src/tools/csv-tools/CsvTable.tsx:39`
- **Impact:** Filter/sort reset is keyed by `columns.join(' ')`, so distinct headers can collide.
  For example, schemas `['a b', 'c']` and `['a', 'b c']` share the same key; loading the second file
  can retain filters or sorting from the first and hide or reorder its rows unexpectedly.
- **Recommendation:** Use an unambiguous serialization such as `JSON.stringify(columns)` and add a
  regression test for colliding header arrays.

#### D-04 — JSONC mode accepts and can erase an unterminated block comment

- **Severity:** Medium
- **Tool:** JSON Tools
- **Evidence:** `src/tools/json-tools/JsonTools.tsx:93`,
  `src/tools/json-tools/JsonTools.tsx:402`
- **Impact:** The comment normalizer replaces everything from `/*` through end-of-file with spaces
  when no closing `*/` exists. With comments enabled, `{"ok":true} /* never closes` is reported as
  valid; Format or Minify then silently discards the malformed trailing content.
- **Recommendation:** Treat end-of-file inside a block comment as a lexical error with the original
  offset. Add malformed block-comment validation and non-destructive-action tests.

### Web

#### WEB-01 — CSS to Tailwind swaps viewport-axis semantics

- **Severity:** Medium
- **Tool:** CSS to Tailwind
- **Evidence:** `src/tools/css-to-tailwind/CssToTailwind.tsx:288`
- **Impact:** Both `100vw` and `100vh` map to the `screen` shortcut regardless of property axis.
  Thus `height: 100vw` becomes `h-screen` (`100vh`), and `width: 100vh` becomes `w-screen`
  (`100vw`); positional properties inherit the same error.
- **Recommendation:** Use the screen shortcut only when property axis and viewport unit match, and
  emit an arbitrary value otherwise. Add cross-axis width, height, and position tests.

#### WEB-02 — invalid CSS selectors are presented as valid zero-specificity entries

- **Severity:** Medium
- **Tool:** CSS Specificity
- **Evidence:** `src/tools/css-specificity/CssSpecificity.tsx:48`
- **Impact:** Parser failures are swallowed and returned as `(0,0,0)`. An input such as `.foo[` is
  rendered as a normal result and participates in winner/tie calculations instead of being flagged.
- **Recommendation:** Return parse validity/error metadata, visibly mark invalid rows, and exclude
  them from comparison. Add malformed-selector tests.

#### WEB-03 — specificity breakdown can contradict the computed score

- **Severity:** Medium
- **Tool:** CSS Specificity
- **Evidence:** `src/tools/css-specificity/CssSpecificity.tsx:51`
- **Impact:** Display tokens come from a generic AST walk while the numeric helper applies special
  rules for functional pseudo-classes. `:where(#id) .a` correctly scores `(0,1,0)` but displays the
  zero-weight `#id` as a red ID contribution; `:is(#a,.b)` displays both alternatives although only
  the maximum-specificity branch contributes.
- **Recommendation:** Derive display parts from the same recursive calculation as the score, or
  explicitly label zero-weight/non-winning tokens. Add `:where`, `:is`, and `:not` parity tests.

#### WEB-04 — HTML statistics mistake tag text for authored document wrappers

- **Severity:** Medium
- **Tool:** HTML Validator
- **Evidence:** `src/workers/html.api.ts:21`, `src/workers/html.api.ts:36`,
  `src/tools/html-validator/html-helpers.ts:335`
- **Impact:** Raw regular expressions decide whether parser-inserted `html`, `head`, and `body`
  wrappers were authored. A fragment such as `<script>const x = "<html>";</script><div>ok</div>` is
  reported as three elements at depth two rather than two authored elements at depth one.
- **Recommendation:** Identify authored wrapper elements through parser source locations and share
  one parser-backed statistics implementation. Add tag-like text/comment fixtures.

#### WEB-05 — `!important` detection mutates valid selectors

- **Severity:** Medium
- **Tool:** CSS Specificity
- **Evidence:** `src/tools/css-specificity/CssSpecificity.tsx:110`
- **Impact:** Substring detection plus global replacement treats any occurrence as a declaration
  flag. The valid selector `[data-note="!important"]` is marked important and analyzed as
  `[data-note=""]`, changing the selector whose specificity is reported.
- **Recommendation:** Remove `!important` from selector input because it is a declaration property,
  or parse only a documented trailing annotation outside selector grammar. Never globally replace
  selector content; add quoted/escaped literal tests.

### Convert

#### CON-01 — Image Tool has no decoded/output-pixel resource budget

- **Severity:** High
- **Tool:** Image Tool
- **Evidence:** `src/tools/image-tool/ImageTool.tsx:163`,
  `src/tools/image-tool/ImageTool.tsx:272`
- **Impact:** Input is gated only by MIME, read completely as a data URL, and accepted at its natural
  dimensions. User-provided output dimensions are allocated directly on a main-thread canvas. A
  decompression-bomb image or dimensions such as `100000 × 100000` can request tens of gigabytes,
  stall/crash the renderer, or produce a blank export.
- **Recommendation:** Enforce input-byte, decoded-pixel, and output-pixel budgets before reading or
  allocating; show a clear limit error and move expensive decode/encode work off the main thread
  where supported. Add oversized-file/dimension tests.

#### CON-02 — Color Converter accepts seven-digit hex and drops the last digit

- **Severity:** Medium
- **Tool:** Color Converter
- **Evidence:** `src/tools/color-converter/ColorConverter.tsx:207`
- **Impact:** Validation accepts three through eight hex digits, but parsing handles 3/4 and then
  reads only the first six unless the length is exactly eight. `#1234567` is silently converted as
  `#123456`, turning a typo into an apparently valid, copyable color.
- **Recommendation:** Accept only 3, 4, 6, or 8 digits and add invalid-length regression tests.

#### CON-03 — generated Node requests calculate `Content-Length` as UTF-16 characters

- **Severity:** Medium
- **Tool:** cURL to Fetch
- **Evidence:** `src/tools/curl-to-fetch/CurlToFetch.tsx:274`
- **Impact:** Generated code uses `body.length`. For `curl -d 'ș' ...`, it declares one byte although
  the UTF-8 body contains two, which can truncate, block, or corrupt request parsing.
- **Recommendation:** Generate `Buffer.byteLength(body, 'utf8')` and test non-ASCII request bodies.

#### CON-04 — generated Axios/Ky code mishandles JSON arrays and malformed objects

- **Severity:** Medium
- **Tool:** cURL to Fetch
- **Evidence:** `src/tools/curl-to-fetch/CurlToFetch.tsx:221`
- **Impact:** Only a body starting with `{` is emitted as JSON source. `[1,2]` becomes a JSON string,
  changing the payload type, while malformed text beginning with `{` is emitted raw and can make
  the generated program syntactically invalid.
- **Recommendation:** Parse JSON safely and emit parsed objects or arrays only on success; otherwise
  preserve the body as a string. Add array and malformed-JSON cases for every generator.

#### CON-05 — timestamp heuristic misreads pre-2001 and negative millisecond epochs

- **Severity:** Medium
- **Tool:** Timestamp Converter
- **Evidence:** `src/tools/timestamp-converter/TimestampConverter.tsx:48`
- **Impact:** Every numeric value below `1e12` is treated as seconds. Negative millisecond epochs and
  all millisecond dates before 2001-09-09 are therefore interpreted at the wrong scale; for example
  `-86400000` is not shown as 1969-12-31.
- **Recommendation:** Add an explicit Seconds/Milliseconds control (or an explicit documented
  disambiguation) and cover negative and historical epochs.

#### CON-06 — Base64 URL-safe mode is ignored for files

- **Severity:** Medium
- **Tool:** Base64
- **Evidence:** `src/tools/base64/Base64Tool.tsx:214`,
  `src/tools/base64/Base64Tool.tsx:556`
- **Impact:** File mode stores the browser-generated standard Base64 data URI and copies its payload
  unchanged. With URL-safe enabled, a byte such as `0xfb` still copies as `/w==` instead of `_w`,
  violating the active option and producing unsuitable URL/path data.
- **Recommendation:** Encode file bytes through the same URL-safe transform as text, retaining MIME
  separately for data-URI output. Add file-mode URL-safe tests.

#### CON-07 — Base64 file mode reads and retains arbitrary-size files

- **Severity:** Medium
- **Tool:** Base64
- **Evidence:** `src/tools/base64/Base64Tool.tsx:92`,
  `src/tools/base64/Base64Tool.tsx:214`
- **Impact:** Any selected file is read completely as a data URI and held in React state. Base64 adds
  roughly one-third to the byte size before JavaScript string overhead, so a very large file can
  freeze or exhaust renderer memory.
- **Recommendation:** Enforce and display a maximum file size before reading; offer streaming or
  chunked export for larger files instead of rendering/copying one giant string. Test the limit.

#### CON-08 — URL Codec mixes error diagnostics into copyable bulk output

- **Severity:** Low
- **Tool:** URL Codec
- **Evidence:** `src/tools/url-codec/UrlCodec.tsx:103`,
  `src/tools/url-codec/UrlCodec.tsx:245`
- **Impact:** A malformed line becomes literal text such as `[decode error: ...] <original>` inside
  the output. Copying or swapping a mixed-validity conversion therefore corrupts failed lines and
  makes the result non-round-trippable.
- **Recommendation:** Preserve failed lines unchanged and return per-line error metadata rendered
  outside the copyable payload. Add a mixed-valid/invalid bulk test.

### Test

#### TST-01 — zero-width global regexes loop until the match cap

- **Severity:** High
- **Tool:** Regex Tester
- **Evidence:** `src/workers/regex.api.ts:174`
- **Impact:** After an empty match the scanner manually advances `lastIndex`, but after advancing
  beyond the input, a failed `exec` resets `lastIndex` to zero and the loop begins again. `/(?:)/g`
  over `a` is reported as `1000+` duplicate matches instead of two boundary matches.
- **Recommendation:** Stop once manual advancement passes the input end, using a Unicode-aware
  `AdvanceStringIndex` equivalent. Cover empty global and multiline-boundary patterns.

#### TST-02 — JWT verification uses stale credentials from the wrong algorithm family

- **Severity:** Medium
- **Tool:** JWT Decoder
- **Evidence:** `src/tools/jwt-decoder/jwt-verify.ts:172`,
  `src/tools/jwt-decoder/jwt-verify.ts:200`
- **Impact:** Verification returns “unchecked” only when both secret and public key are blank.
  Switching from an RS token with a stored public key to HS256 without a secret therefore attempts
  verification using an empty HMAC key and reports Invalid/error instead of requesting a secret;
  the reverse transition similarly attempts an empty public-key import.
- **Recommendation:** Check prerequisites by algorithm: HS requires a non-empty secret, and
  asymmetric algorithms require a non-empty public key. Ignore stale opposite-family state and test
  both transitions.

#### TST-03 — JWT credentials and decoded tokens persist as plaintext application data

- **Severity:** Medium
- **Tool:** JWT Decoder
- **Evidence:** `src/tools/jwt-decoder/JwtDecoder.tsx:32`,
  `src/hooks/useToolState.ts:102`, `src/tools/jwt-decoder/JwtDecoder.tsx:193`
- **Impact:** Token and shared secret are part of persisted tool state written to SQLite. The token
  prefix and full decoded payload are also copied into history, increasing exposure through local
  databases and backups without a visible opt-in or sensitive-data control.
- **Recommendation:** Keep secrets volatile by default; make token/history persistence opt-in with a
  clear warning and a “Clear sensitive data” action. Never write signing secrets to history.

#### TST-04 — live JWT decoding creates repetitive history records

- **Severity:** Medium
- **Tool:** JWT Decoder
- **Evidence:** `src/tools/jwt-decoder/JwtDecoder.tsx:193`
- **Impact:** A React effect writes history for every successfully decoded edit/paste rather than an
  explicit user action, producing duplicate records and retaining full payloads while the user
  types.
- **Recommendation:** Do not record live decoding. Record only explicit Verify, Re-sign, or Copy
  actions with appropriate redaction, and test that editing does not create history.

### Network

#### NET-01 — response display cap does not cap response memory use

- **Severity:** Medium
- **Tool:** API Client
- **Evidence:** `src/tools/api-client/ApiClient.tsx:741`,
  `src/tools/api-client/ApiClient.tsx:750`
- **Impact:** The complete body is read with `arrayBuffer()` before the 1 MB display limit is
  applied, then copied again into a new byte array for the response Blob. Large downloads can freeze
  or exhaust the WebView despite the UI presenting a bounded display policy.
- **Recommendation:** Check `Content-Length` where available, stream/cap body acquisition, provide a
  direct-to-file path for large downloads, and avoid the redundant Blob copy. Test large/binary
  responses.

#### NET-02 — API history persistence failures become unhandled rejections

- **Severity:** Medium
- **Tool:** API Client
- **Evidence:** `src/tools/api-client/ApiClient.tsx:784`, `src/stores/api.store.ts:244`
- **Impact:** `addRequestHistory()` is fire-and-forgotten without a rejection handler. A locked,
  full, or unavailable database can create an unhandled rejection while the UI gives no indication
  that the successful request was not recorded.
- **Recommendation:** Await/catch history persistence independently of request success and show a
  non-blocking “history not saved” message. Add a rejected-store test.

#### NET-03 — active API environment is lost on restart

- **Severity:** Low
- **Tool:** API Client
- **Evidence:** `src/stores/api.store.ts:70`, `src/stores/api.store.ts:144`
- **Impact:** Initialization always selects the first environment and the setter changes memory
  only. After choosing environment B and restarting, requests silently return to environment A,
  potentially changing resolved endpoints and credentials.
- **Recommendation:** Persist the active environment ID and validate it against the loaded set,
  falling back only when the saved environment no longer exists.

#### NET-04 — Docs Browser cannot reliably distinguish a document from an error page

- **Severity:** Low
- **Tool:** Docs Browser
- **Evidence:** `src/tools/docs-browser/DocsBrowser.tsx:54`,
  `src/tools/docs-browser/DocsBrowser.tsx:204`
- **Impact:** The preflight recognizes only HEAD 404/410, while iframe `onError` is not a reliable
  cross-origin HTTP failure signal. Authentication errors, server errors, or sources rejecting HEAD
  can appear as successful error documents or indefinite loading instead of actionable failure.
- **Recommendation:** Treat embedding as best-effort, make external opening the reliable fallback,
  and expose probe status if preflight is retained. Test non-2xx and HEAD-rejection behavior.

#### NET-05 — embedded documentation receives a broad browser capability set

- **Severity:** Low
- **Tool:** Docs Browser
- **Evidence:** `src/tools/docs-browser/DocsBrowser.tsx:193`
- **Impact:** Fixed third-party DevDocs pages run with scripts, same-origin access, popups, and forms
  inside the app. This is not currently arbitrary user-controlled navigation, but it expands the
  trusted in-app web surface beyond a read-only documentation viewer.
- **Recommendation:** Test the minimum sandbox permissions DevDocs requires, remove unnecessary
  capabilities, document the trust boundary, and favor external browsing if functionality depends
  on the broad policy.

### Write

#### WRT-01 — duplicating a snippet drops its favorite state

- **Severity:** Medium
- **Tool:** Snippets
- **Evidence:** `src/tools/snippets/SnippetsManager.tsx:452`,
  `src/stores/snippets.store.ts:75`
- **Impact:** Duplicate forwards visible tags and folder but omits the explicit favorite argument,
  which defaults to false. A duplicated favorite disappears when the Favorites filter is enabled.
- **Recommendation:** Pass the selected snippet’s normalized favorite value to `addSnippet` and add
  a duplicate-favorite regression test.

#### WRT-02 — malformed template files produce a clipboard-specific error

- **Severity:** Low
- **Tool:** Prompt Templates
- **Evidence:** `src/tools/prompt-templates/template-import.ts:52`,
  `src/tools/prompt-templates/PromptTemplates.tsx:995`
- **Impact:** Import opens a file picker, but invalid JSON reports that the clipboard does not
  contain valid JSON, sending the user to the wrong recovery path.
- **Recommendation:** Use a file-specific or source-neutral error message and cover malformed-file
  import.

#### WRT-03 — snippet import is unbounded, non-transactional, and serial

- **Severity:** Medium
- **Tool:** Snippets
- **Evidence:** `src/tools/snippets/SnippetsManager.tsx:563`
- **Impact:** The complete backup is parsed without byte/item/field limits, then every snippet is
  written sequentially. Large valid backups can take a long time, and a later database failure
  leaves earlier snippets committed while the UI reports only a generic failure.
- **Recommendation:** Validate byte, item, and field limits; insert in a store-level transaction or
  bounded batches; and report partial-completion counts if atomic import is not possible.

#### WRT-04 — prompt-template import has no resource limits

- **Severity:** Medium
- **Tool:** Prompt Templates
- **Evidence:** `src/tools/prompt-templates/template-import.ts:44`,
  `src/stores/prompt-templates.store.ts:139`
- **Impact:** Arbitrary arrays and unconstrained nested strings are parsed and mapped in renderer
  memory, then written in one batch. A huge local file can exhaust memory or exceed database limits
  before producing a useful validation error.
- **Recommendation:** Enforce maximum file bytes before parsing plus template-count and per-field
  limits. Return specific validation errors and add boundary tests.

#### WRT-05 — overlapping template writes make the saving state inaccurate

- **Severity:** Low
- **Tool:** Prompt Templates
- **Evidence:** `src/stores/prompt-templates.store.ts:89`,
  `src/tools/prompt-templates/PromptTemplates.tsx:1355`
- **Impact:** Each operation independently toggles one boolean. If two writes overlap, the first to
  finish sets `saving` false while the other remains active, so UI completion/status can be false.
- **Recommendation:** Track an in-flight count or serialize writes through a queue, and test
  overlapping store operations.

## Application-wide findings

### Application shell and lifecycle

#### SH-01 — startup session restoration can overwrite newly opened tabs

- **Severity:** High
- **Evidence:** `src/app/providers.tsx:71`, `src/app/providers.tsx:100`,
  `src/app/providers.tsx:219`, `src/stores/settings.store.ts:86`
- **Impact:** Settings initialization marks the app ready and renders the workspace before the
  remaining stores, MCP startup, and saved-tab restoration complete. If startup is slow, a user can
  open a tool and then have that new tab replaced when the old session is finally restored.
- **Recommendation:** Gate interactive rendering on an explicit bootstrap-ready state set after
  session restoration and required listeners, or restore tabs before settings exposes the shell.
  Add a deferred-initialization race test.

#### SH-02 — dirty duplicate tabs close without confirmation and lose scoped state

- **Severity:** High
- **Evidence:** `src/stores/ui.store.ts:266`, `src/stores/ui.store.ts:278`,
  `src/components/shell/WorkspaceTabStrip.tsx:417`,
  `src/hooks/useGlobalShortcuts.ts:82`
- **Impact:** Close, Close Others, Close Right, and Cmd/Ctrl+W invoke destructive tab closure
  directly. The store deletes scoped state for duplicate tabs and merely removes their dirty IDs;
  there is no confirmation or recovery path for an edited draft.
- **Recommendation:** Route every close variant through one requested-close coordinator that checks
  all affected dirty IDs and confirms before invoking the destructive store action. Test mouse,
  keyboard, bulk-close, and duplicate-tab paths.

#### SH-03 — saved window coordinates can restore the app entirely off-screen

- **Severity:** Medium
- **Evidence:** `src/app/providers.tsx:55`
- **Impact:** Validation uses fixed coordinate bounds rather than live monitor work areas. A saved
  position such as `x=3500` from a detached display passes and can place the complete window beyond
  a remaining 1920-pixel display.
- **Recommendation:** Validate that the restored rectangle intersects an available monitor work
  area, otherwise recenter it. Cover detached-monitor coordinates.

#### SH-04 — sidebar resizing can remain stuck after pointer release outside the window

- **Severity:** Medium
- **Evidence:** `src/components/shell/Sidebar.tsx:105`,
  `src/components/shell/NotesDrawer.tsx:476`
- **Impact:** Resize cleanup listens only for document `mousemove`/`mouseup`. Releasing over another
  window or losing focus can leave listeners, resize state, `user-select`, and cursor overrides
  active when the user returns.
- **Recommendation:** Extract one pointer-capture resize gesture shared by Sidebar and NotesDrawer,
  with cleanup on pointer-up/cancel, window blur, and unmount. Snapshot and restore prior body styles
  rather than clearing them. Add interrupted-drag tests.

#### SH-05 — Cmd/Ctrl+Enter can send an API request twice

- **Severity:** High
- **Evidence:** `src/hooks/useKeyboardShortcut.ts:45`,
  `src/hooks/useGlobalShortcuts.ts:141`, `src/tools/api-client/ApiClient.tsx:1261`,
  `src/tools/api-client/ApiClient.tsx:1273`
- **Impact:** The shortcut registry invokes every matching registration. API Client handles the
  global Execute action and separately registers the same shortcut, so one keypress starts two
  sends; the later call aborts/replaces the first, but both requests can reach the server.
- **Recommendation:** Make shortcut ownership exclusive/priority-aware and remove redundant local
  registrations where global Execute applies. Allow fan-out only explicitly and add a real shared-
  registry integration test asserting one send.

#### SH-06 — geometry persistence waits for optional bootstrap work

- **Severity:** Medium
- **Evidence:** `src/app/providers.tsx:143`
- **Impact:** Move/resize listeners are attached only after store initialization, MCP startup, and
  tab restoration. If optional startup work stalls or fails while the shell is visible, window
  changes are never persisted.
- **Recommendation:** Attach geometry persistence immediately after geometry restoration, with an
  independent lifecycle and cleanup. Test registration while MCP initialization is deferred.

#### SH-07 — native window focus is invoked twice per command

- **Severity:** Low
- **Evidence:** `src-tauri/src/window_commands.rs:31`,
  `src/components/shell/CommandPalette.tsx:452`
- **Impact:** `window_focus` calls `set_focus()` twice on the same native window, adding redundant
  work and a duplicate failure surface every time Command Palette opens.
- **Recommendation:** Retain one focus call, or document and test the platform reason if two calls
  are intentionally required.

### Shared components and primitives

#### CMP-01 — Command Palette is visually modal but does not contain focus

- **Severity:** High
- **Evidence:** `src/components/shell/CommandPalette.tsx:549`,
  `src/components/shell/CommandPalette.tsx:593`
- **Impact:** The palette renders a scrim and `role="dialog"` without `aria-modal`, a Tab trap, or
  background inertness. Tabbing can activate title-bar or workspace controls behind the overlay,
  and assistive technology can traverse the obscured application.
- **Recommendation:** Reuse/extend the shared Dialog boundary, move the combobox inside it, contain
  focus, mark it modal, inert the background, and restore trigger focus. Add modal keyboard tests.

#### CMP-02 — workspace tabs contain a nested close button inside `role="tab"`

- **Severity:** High
- **Evidence:** `src/components/shell/WorkspaceTabStrip.tsx:391`,
  `src/components/shell/WorkspaceTabStrip.tsx:492`
- **Impact:** ARIA tabs make descendants presentational, so the nested interactive Close button can
  be hidden or misrepresented to assistive technology and creates invalid interactive semantics.
- **Recommendation:** Make tab and Close sibling controls, or expose closure through a separately
  reachable context/keyboard action with valid ownership. Test the accessibility tree.

#### CMP-03 — tab-strip wheel forwarding can also scroll the workspace

- **Severity:** Medium
- **Evidence:** `src/components/shell/WorkspaceTabStrip.tsx:134`,
  `src/components/shell/WorkspaceTabStrip.tsx:351`
- **Impact:** JSX `onWheel` mutates horizontal scroll without preventing the vertical default. With
  overflowing tabs, one gesture can move the tab strip and a vertically scrollable workspace.
- **Recommendation:** Attach an imperative non-passive wheel listener, prevent default only when
  consuming the gesture, and clean it up.

#### CMP-04 — SplitPane accepts corrupt persisted ratios without initial clamping

- **Severity:** Medium
- **Evidence:** `src/components/shared/SplitPane.tsx:90`,
  `src/components/shared/SplitPane.tsx:143`
- **Impact:** The initial ratio comes directly from storage/default props; clamping occurs only
  after interaction. A stored value of `2` renders the first pane at 200% and makes the second pane
  unusable until the divider is moved.
- **Recommendation:** Validate finite defaults/minima and clamp persisted/default ratios before the
  first render. Add corrupt/out-of-range storage tests.

#### CMP-05 — Notes drawer separator is not keyboard-resizable

- **Severity:** Medium
- **Evidence:** `src/components/shell/NotesDrawer.tsx:476`,
  `src/components/shell/NotesDrawer.tsx:704`
- **Impact:** The mouse-only divider has `role="separator"` but no focusability, value attributes, or
  Arrow/Home/End handling, so keyboard users cannot resize the drawer.
- **Recommendation:** Extract one accessible resize-separator primitive for Notes, Sidebar, and
  SplitPane, with pointer capture, keyboard behavior, and ARIA values.

#### CMP-06 — InspectorTree cannot safely inspect cyclic or deeply nested data

- **Severity:** Medium
- **Evidence:** `src/components/shared/InspectorTree.tsx:43`,
  `src/components/shared/InspectorTree.tsx:141`
- **Impact:** Traversal/rendering recurses without cycle or depth/node guards, and serialization uses
  raw `JSON.stringify`. Cyclic inspector input can throw or overflow; sufficiently deep input can
  hang the pane.
- **Recommendation:** Track visited objects/path, enforce depth/node budgets, render circular or
  truncated sentinels, and use cycle-safe copy serialization.

#### CMP-07 — repeated CopyButton use shortens later success feedback

- **Severity:** Low
- **Evidence:** `src/components/shared/CopyButton.tsx:16`
- **Impact:** Every click creates an independent timer. Copying again before the first timer expires
  lets the old timer clear the newer “Copied” state early; timers also survive unmount.
- **Recommendation:** Store one timeout ref, clear/restart it on success, and clean up on unmount.

#### CMP-08 — SendToMenu can render off-screen and has an unnamed filter

- **Severity:** Low
- **Evidence:** `src/components/shared/SendToMenu.tsx:54`
- **Impact:** Positioning caps only maximum coordinates, allowing negative left/top values in narrow
  windows, while the filter input has no accessible name.
- **Recommendation:** Clamp both viewport bounds using measured dimensions and label the filter.

#### CMP-09 — SelectionContextToolbar clamps its anchor, not its visible surface

- **Severity:** Medium
- **Evidence:** `src/components/shared/SelectionContextToolbar.tsx:56`,
  `src/components/shared/SelectionContextToolbar.tsx:118`
- **Impact:** Translation is applied after anchor clamping, so a tall/wide toolbar can still extend
  above or beyond the viewport when text near an edge is selected.
- **Recommendation:** Measure the mounted toolbar, clamp its final rectangle, and choose above/below
  placement based on available space.

#### CMP-10 — selection actions hide failures and always dismiss

- **Severity:** Medium
- **Evidence:** `src/components/shared/SelectionContextToolbar.tsx:131`
- **Impact:** Rejected clipboard/native actions are swallowed and the toolbar always closes. Users
  receive no error, lose their selection workflow, and must retry blindly.
- **Recommendation:** Surface failures through status/toast, dismiss only on success, and test a
  rejecting action.

#### CMP-11 — SendToMenu lacks popup semantics and keyboard item navigation

- **Severity:** Low
- **Evidence:** `src/components/shared/SendToMenu.tsx:60`
- **Impact:** The menu-like surface has no dialog/menu/listbox relationship, option announcement, or
  Arrow-key navigation; assistive-technology users encounter an unnamed filter and ordinary buttons.
- **Recommendation:** Reuse Popover and implement a labelled dialog/listbox with active-descendant
  or roving-tabindex navigation.

#### CMP-12 — ErrorBoundary ignores its public fallback message prop

- **Severity:** Low
- **Evidence:** `src/components/shared/ErrorBoundary.tsx:5`,
  `src/components/shared/ErrorBoundary.tsx:23`
- **Impact:** Callers can provide `fallbackMessage`, but every failure renders only “Something
  broke,” making the API misleading and preventing contextual recovery guidance.
- **Recommendation:** Render the supplied fallback with a default and test it, or remove the prop.

#### CMP-13 — SplitPane drag resizing excludes touch and pen input

- **Severity:** Low
- **Evidence:** `src/components/shared/SplitPane.tsx:152`,
  `src/components/shared/SplitPane.tsx:250`
- **Impact:** Drag handling uses mouse events exclusively, so touch/pen users cannot resize even
  though keyboard resizing remains available.
- **Recommendation:** Adopt Pointer Events with pointer capture and retain keyboard behavior.

### Cross-cutting UI and accessibility

#### UI-01 — Settings navigation lacks tab semantics and keyboard behavior

- **Severity:** Medium
- **Evidence:** `src/components/shell/SettingsPanel.tsx:1268`
- **Impact:** Six section selectors are ordinary buttons without tablist/tab/tabpanel roles,
  selected state, relationships, or Arrow/Home/End navigation.
- **Recommendation:** Reuse an upgraded Tabs primitive and link each selected tab to its panel.

#### UI-02 — shared TabBar does not link tabs to their panels

- **Severity:** Medium
- **Evidence:** `src/components/shared/TabBar.tsx:60`
- **Impact:** Tab roles and selected state are present, but tabs have no IDs/`aria-controls` and
  consumers render changing content outside the primitive. Assistive technology cannot associate
  the selected tab with the content it controls.
- **Recommendation:** Add IDs/panel IDs or replace it with a compound Tabs API that owns linked
  panels; use radiogroup semantics for mode switches that do not control panels.

#### UI-03 — Field help and error text is not associated with its control

- **Severity:** Medium
- **Evidence:** `src/components/shared/Field.tsx:43`
- **Impact:** The widely used primitive renders hints/errors without generating IDs or merging
  `aria-describedby`, `aria-errormessage`, and `aria-invalid` into its control. Focused users may
  hear only label and value, not corrective guidance.
- **Recommendation:** Give Field a single-control slot/compound API that wires description and error
  IDs while preserving caller-provided relationships.

#### UI-04 — toasts are not announced or keyboard-dismissable

- **Severity:** Medium
- **Evidence:** `src/components/shared/Toast.tsx:16`, `src/stores/ui.store.ts:400`
- **Impact:** Toasts are clickable divs without live-region/status semantics, button behavior, or
  keyboard dismissal; errors also disappear unconditionally after three seconds.
- **Recommendation:** Add status/alert live regions and a semantic Close button, and retain errors
  until dismissal or for an accessible timeout.

#### UI-05 — collapsed-sidebar flyout bypasses the shared popover contract

- **Severity:** Medium
- **Evidence:** `src/components/shell/SidebarCollapsedGroup.tsx:108`,
  `src/components/shell/SidebarCollapsedGroup.tsx:141`
- **Impact:** The portaled generic div lacks a named popup role, focus entry/restoration, keyboard
  containment/navigation, and a trigger relationship. Keyboard and screen-reader users cannot
  reliably discover or operate the flyout.
- **Recommendation:** Migrate it to the shared Popover and deliberately implement dialog or menu
  semantics with focus and relationship tests.

### Reusability and cross-cutting architecture

#### ARC-01 — Settings export and import are asymmetric

- **Severity:** High
- **Evidence:** `src/components/shell/SettingsPanel.tsx:599`,
  `src/components/shell/SettingsPanel.tsx:663`, `src/stores/settings.store.ts:14`
- **Impact:** Export includes `shellStyle` and `sidebarWidth`, but import never applies either key.
  A valid backup therefore reports success while silently restoring only part of the user profile.
- **Recommendation:** Move typed snapshot validation/application into the settings domain and add a
  round-trip test asserting every exported key is restored or explicitly excluded. If layout width
  is intentionally non-portable, omit it from export.

#### ARC-02 — text-document open/save lifecycle is duplicated across at least eight tools

- **Severity:** Medium
- **Evidence:** `src/tools/xml-tools/XmlTools.tsx:245`,
  `src/tools/code-formatter/CodeFormatter.tsx:263`,
  `src/tools/json-tools/JsonTools.tsx:497`, `src/tools/yaml-tools/YamlTools.tsx:301`,
  `src/tools/refactoring-toolkit/RefactoringToolkit.tsx:315`,
  `src/tools/css-validator/CssValidator.tsx:394`,
  `src/tools/html-validator/HtmlValidator.tsx:404`,
  `src/tools/markdown-editor/MarkdownEditor.tsx:934`
- **Impact:** Tools reuse low-level file I/O and button components but separately maintain open,
  save, Save As, metadata, dirty-state, error, and extension behavior. Fixes require synchronized
  edits and have already created multiple semantic variants.
- **Recommendation:** Extract a narrow `useTextDocumentFileActions` contract for simple editors and
  migrate XML/JSON/YAML/Code Formatter/Refactoring first. Keep richer CSS/HTML/Markdown variants
  local until their document semantics align.

#### ARC-03 — Prompt Templates duplicates shared modal focus behavior twice

- **Severity:** Medium
- **Evidence:** `src/tools/prompt-templates/PromptTemplates.tsx:245`,
  `src/tools/prompt-templates/PromptTemplates.tsx:409`,
  `src/components/shared/Dialog.tsx:62`
- **Impact:** Quick Fill and Template Editor separately implement focus capture/restore, Escape,
  Tab trapping, delayed initial focus, and global key listeners. Accessibility fixes to Dialog do
  not reach them, and each copy can drift.
- **Recommendation:** Extend Dialog with a narrowly scoped custom panel/body slot, or extract its
  modal-focus lifecycle, then migrate both while retaining their unique body/actions locally.

#### ARC-04 — core modules combine too many independently changing responsibilities

- **Severity:** Medium
- **Evidence:** `src/tools/api-client/ApiClient.tsx:162`,
  `src/tools/api-client/ApiClient.tsx:335`, `src/tools/json-tools/JsonTools.tsx:369`,
  `src/tools/json-tools/JsonTools.tsx:870`,
  `src/tools/markdown-editor/MarkdownEditor.tsx:510`,
  `src/components/shell/SettingsPanel.tsx:284`
- **Impact:** API Client (2,059 lines), JSON Tools (1,490), Markdown Editor (1,519), and Settings
  Panel (1,297) mix pure helpers, persistence, transport/commands, modal state, and multiple UI
  units. Changes create broad regression/merge surfaces and prevent isolated reuse/testing.
- **Recommendation:** Extract existing cohesive local units behind typed props/hooks—transport and
  request/response panes, inspector/tree/table, document commands/modals, and settings tabs. Avoid a
  new generic framework and preserve current external behavior.

#### ARC-05 — editor keybinding schema exposes unreachable Vim/Emacs modes

- **Severity:** Low
- **Evidence:** `src/types/models.ts:68`, `src/stores/settings.store.ts:80`,
  `src/components/shell/SettingsPanel.tsx:73`,
  `src/components/shell/StatusBar.tsx:104`
- **Impact:** The public model permits `standard | vim | emacs`, but initialization resets every
  non-standard value, the UI/importer accepts only standard, and StatusBar retains an unreachable
  branch. Old imports are silently altered and future implementation must reconcile dead contracts.
- **Recommendation:** Either remove unsupported modes from type/UI/status with an explicit stored-
  value migration, or implement and validate Monaco keybindings consistently.

## Cross-cutting observations

### 1. Resource limits are inconsistent

Image Tool, Base64, API Client, JSON Tools, Snippets, and Prompt Templates all accept or produce
unbounded data before applying display or validation constraints. Establish shared byte, node,
depth, decoded-pixel, and output-pixel policies with reusable UI errors. Limits must be enforced
before expensive reads, parsing, allocation, or persistence.

### 2. Async freshness and persistence failures need a common pattern

Diff Viewer and TypeScript Playground can publish stale worker results; Code Formatter can drop the
newest queued work; API history is fire-and-forgotten; template saving uses an inaccurate shared
boolean. Introduce a documented request-generation/cancellation pattern for derived output and a
standard helper for non-blocking persistence failures.

### 3. Transformations need semantic, not just surface-syntax, tests

Refactoring Toolkit, XML to JSON, CSS to Tailwind, cURL to Fetch, Timestamp Converter, Base64, and
URL Codec all have cases where plausible output is semantically wrong or lossy. Golden tests should
assert runtime behavior or round trips where possible, plus explicit warnings where loss is
unavoidable.

### 4. Sensitive local state needs an explicit retention policy

JWT tokens, shared secrets, and decoded claims currently flow into persisted tool state and history.
Local-first storage is not equivalent to ephemeral storage. Define which tool fields are volatile,
which history entries are redacted, and how users clear sensitive data.

### 5. Error channels should not contaminate successful output

URL Codec embeds diagnostics into copyable output, Docs Browser cannot reliably distinguish error
documents, API Client hides history-write failure, and Prompt Templates reports the wrong source.
Tools should keep converted/generated payloads separate from validation, persistence, and transport
errors so copying or exporting never includes diagnostic text.

### 6. Interactive primitives are bypassed too often

Command Palette and Prompt Templates reimplement modal behavior; Settings and several tool modes
implement incomplete tab semantics; collapsed Sidebar and Send To bypass Popover behavior; Sidebar
and Notes duplicate resize gestures. Strengthen the shared Dialog, Tabs, Popover, and resize
contracts, then migrate consumers so focus, keyboard, positioning, and cleanup fixes apply once.

### 7. Shell lifecycle work needs explicit readiness and ownership

Bootstrap readiness currently differs from settings readiness, geometry listeners depend on optional
services, and shortcut registrations fan out without ownership. Define independent shell lifecycle
phases and exclusive shortcut scopes so optional subsystems cannot overwrite user actions or delay
core window behavior.

## Suggested implementation order

1. **Prevent broken generated code:** C-01 through C-04, then C-05 and CON-03/CON-04.
2. **Add shared resource budgets:** CON-01, CON-07, NET-01, D-02, WRT-03, and WRT-04.
3. **Fix silent data/correctness loss:** D-01, D-04, TST-01, WEB-01/WEB-02/WEB-05, CON-02,
   CON-05/CON-06, and WRT-01.
4. **Standardize async freshness/error handling:** C-06 through C-08, NET-02, and WRT-05.
5. **Protect sensitive state:** TST-03/TST-04, then algorithm-state fix TST-02.
6. **Repair shell safety and ownership:** SH-01/SH-02/SH-05, then SH-03/SH-04/SH-06.
7. **Consolidate accessible interaction primitives:** CMP-01/CMP-02, UI-01 through UI-05, then
   CMP-03 through CMP-13 and ARC-03.
8. **Restore settings round trips and bounded reuse:** ARC-01, ARC-02, ARC-04, and ARC-05.
9. **Finish medium/low UX and hardening work:** remaining Data/Web/Convert/Network/Write findings.

For implementation planning, group shared-root-cause items into focused PRs rather than creating one
PR per finding. Preserve the IDs above in issue/PR descriptions so remediation can be traced back to
this audit.
