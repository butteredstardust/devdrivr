# Reusability and modularity review

Date: 2026-09-19  
Baseline: `origin/main` at the start of the review  
Scope: frontend, shared TypeScript libraries, workers, stores, and the Rust MCP service  
Out of scope: security review and broad architecture review, as authorized

This is a point-in-time working report. It is intended to drive focused follow-up changes and can
be archived or removed after its recommendations have been converted into tracked work.

## Executive summary

devdrivr already has several effective module boundaries: tools are route-level lazy imports,
Markdown editing has feature-local hooks and modals, shared controls are broadly reused, and the
MCP service has resource-specific routers. The current modularity risk is concentrated rather than
system-wide.

The highest-value work is:

1. Break up the `ApiClient` and `SnippetsManager` component controllers along existing feature
   seams. They are each approximately 1,800-line React functions with 76-82 React hooks.
2. Split `src/lib/db.ts` into domain repositories behind one stable public facade, while preserving
   the `getDb()` singleton rule.
3. Treat Monaco as a loading-boundary problem, not a `useMonaco.ts` line-count problem. Narrow the
   Monaco ESM entry/language registrations and reconsider the unconditional idle preload.
4. Extract image processing and crop interaction from `ImageTool`, and consolidate shared note
   behavior used by the full workspace and drawer.
5. Split format adapters in `api-import.ts`; make smaller, lower-risk follow-ups in MCP discovery
   and validator-style tools only where behavior is genuinely shared.

The recommended approach is vertical extraction: move a complete behavior and its tests together,
keep tool entry components as composition roots, and avoid a new generic framework. File size is a
signal in this report, not a target.

## Method

The review used four kinds of evidence:

- source line counts for production TypeScript/TSX and Rust;
- TypeScript AST measurements of function size, React hook count, store selectors, and JSX nodes;
- static-import reachability from `src/main.tsx`;
- a production Vite build plus its manifest to distinguish initial, shared lazy, and worker assets.

The production build completed successfully. A diagnostic source-map build was also attempted, but
Node exhausted its 4 GB heap while rendering maps. The normal production build was rerun
successfully afterward. No conclusion below depends on the failed source-map build.

## Measured baseline

### Largest stateful React functions

| Function             | Function lines | React hooks | Store selectors | JSX nodes |
| -------------------- | -------------: | ----------: | --------------: | --------: |
| `ApiClient`          |          1,787 |          82 |              11 |       142 |
| `SnippetsManager`    |          1,782 |          76 |              22 |       161 |
| `ImageTool`          |          1,273 |          40 |               1 |       123 |
| `NotesWorkspace`     |          1,179 |          52 |              28 |        95 |
| `MarkdownEditor`     |          1,032 |          41 |               1 |        71 |
| `WorkspaceTabStrip`  |            858 |          24 |              13 |        38 |
| `HtmlValidator`      |            803 |          34 |               1 |        76 |
| `CollectionsSidebar` |            763 |          24 |              21 |        80 |
| `CssValidator`       |            715 |          32 |               1 |        68 |
| `NotesDrawer`        |            711 |          38 |              18 |        99 |

Hook totals count `useState`, `useEffect`, `useMemo`, and `useCallback` calls in each source file.
They are not a quality score; they indicate how many lifecycle and dependency relationships a
reviewer must hold at once.

### Other large production modules

| Module                                           | Lines | Observation                                                     |
| ------------------------------------------------ | ----: | --------------------------------------------------------------- |
| `src-tauri/src/mcp/service/mod.rs`               | 2,798 | 1,576 production lines plus 1,222 test lines                    |
| `src/lib/db.ts`                                  | 1,287 | Connection/write queue plus persistence for every domain        |
| `src-tauri/src/mcp/service/discovery.rs`         | 1,155 | 937 production lines plus 218 test lines                        |
| `src/lib/api-import.ts`                          | 1,112 | Six import formats plus shared normalization/building           |
| `src/tools/color-converter/ColorConverter.tsx`   | 1,111 | Roughly 680 lines of conversion/model code before the component |
| `src/components/shell/NotesDrawer.tsx`           | 1,074 | Editor, list, drag/reorder, resize, history, and rendering      |
| `src/tools/prompt-templates/PromptTemplates.tsx` | 1,398 | Three local feature components plus a 672-line controller       |

### Bundle observations

| Asset                         |    Minified |                Gzip | Loading behavior          |
| ----------------------------- | ----------: | ------------------: | ------------------------- |
| Initial `index` JavaScript    | 1,312.13 KB |           375.47 KB | Initial load              |
| Shared `useMonaco` JavaScript | 3,869.99 KB |           987.65 KB | Shared by 18 Monaco tools |
| Shared `useMonaco` CSS        |   146.36 KB |            22.98 KB | Loaded with Monaco        |
| Monaco TypeScript worker      | 7,071.01 KB | n/a in build output | Worker asset              |
| devdrivr TypeScript worker    | 7,553.12 KB | n/a in build output | Worker asset              |
| Formatter worker              | 2,198.37 KB | n/a in build output | Worker asset              |
| Refactoring worker            | 1,865.46 KB | n/a in build output | Worker asset              |

Worker files are emitted assets and should not be added to initial-load totals. The manifest shows
that the shared Monaco chunk dynamically exposes all bundled basic languages and the CSS, HTML,
JSON, and TypeScript language services.

A simple static-import walk from `src/main.tsx` reached 129 local modules containing about 24,977
source lines. That graph includes `SettingsPanel` and every settings tab even while the dialog is
closed. `DataTab` statically imports all backup hooks; `useApiBackup` imports `api-import.ts`, which
pulls GraphQL and YAML parsing into the initial entry. The initial graph also contains the Markdown
pipeline because `NotesDrawer` is a static child of `App`.

### Improvement included with this report

This PR implements the smallest loading-boundary recommendation: the Data and Acknowledgments tab
bodies are now lazy imports behind accessible Suspense fallbacks. The Settings dialog and its
default/general controls remain immediately available.

| Measure                                   |      Before |       After |              Change |
| ----------------------------------------- | ----------: | ----------: | ------------------: |
| Initial JavaScript, minified              | 1,312.13 KB | 1,136.60 KB | -175.53 KB (-13.4%) |
| Initial JavaScript, gzip                  |   375.47 KB |   323.98 KB |  -51.49 KB (-13.7%) |
| Static local modules from `main.tsx`      |         129 |         117 |                 -12 |
| Static local source lines from `main.tsx` |     ~24,977 |     ~21,693 |             ~-3,284 |

The deferred output now includes a 52.18 KB Acknowledgments chunk, an 8.40 KB Data tab chunk, and
separate backup/parser dependencies such as the 60.54 KB API backup/import chunk and 39.78 KB YAML
chunk. This changes when the work is paid for rather than deleting capabilities. The before/after
production builds use the same checkout, dependency lock, and Vite version.

## Prioritized findings

### P1 — Split `ApiClient` by behavior and pane

Evidence:

- `ApiClient.tsx` is 1,917 lines; its main component occupies 1,787 lines.
- It contains 24 state hooks, 7 effects, 12 memos, and 39 callbacks.
- The `handleSend` callback alone spans roughly 170 lines and combines interpolation, validation,
  auth headers, multipart serialization, cancellation, response limits, decoding, UI state, and
  history persistence.
- Some view extraction already exists in `components/`, proving a local feature-module pattern is
  established, but the component still owns most behavior.

Recommended boundary:

```text
src/tools/api-client/
  ApiClient.tsx                 composition only
  hooks/useApiRequestDraft.ts   draft/header/body/auth mutations
  hooks/useApiRequestRunner.ts  send/cancel/response lifecycle
  hooks/useCollectionRunner.ts  collection execution lifecycle
  request-execution.ts          pure request construction/response decoding
  components/RequestPane.tsx
  components/ResponsePane.tsx
  components/RequestToolbar.tsx
```

Keep Tauri fetch injection at the runner boundary so request construction and response decoding can
be tested without rendering the whole tool. Do not create a generic “tool controller” abstraction.

Expected payoff: smaller change surfaces, focused tests for cancellation and size-limit behavior,
and reusable request execution for collection runs without duplicating the single-request path.

### P1 — Split `SnippetsManager` into a controller and feature panels

Evidence:

- `SnippetsManager.tsx` is 2,030 lines; its component occupies 1,782 lines.
- It contains 20 state hooks, 12 effects, 18 memos, 26 callbacks, and 22 store selectors.
- Search indexing, folder filtering, selection repair, fragment CRUD, formatting, preview,
  tags/favorites, trash/undo, handoff, backup, and the entire view live in one function.
- It is tied with `ApiClient.tsx` for the most frequently changed production file in the available
  six-month Git history (eight commits each).

Recommended boundary:

```text
src/tools/snippets/
  SnippetsManager.tsx             composition only
  hooks/useSnippetLibrary.ts      search/filter/sort/selection model
  hooks/useSnippetFragments.ts    active fragment and fragment commands
  hooks/useSnippetFormatting.ts   Monaco/fallback formatter lifecycle
  components/SnippetLibrary.tsx
  components/SnippetEditor.tsx
  components/SnippetMetadata.tsx
  components/SnippetToolbar.tsx
```

Keep each hook feature-local until a second consumer exists. Extract pure search/sort helpers first,
then components, then lifecycle hooks; that order minimizes behavior changes.

Expected payoff: isolates the most volatile file, makes fragment and filter behavior testable
without a full Monaco render, and reduces effect dependency risk.

### P1 — Turn `db.ts` into a stable facade over domain repositories

Evidence:

- `db.ts` is 1,287 lines and exposes persistence for settings, tool state, notes, note links,
  snippets/fragments, prompt templates, history, folders, backups, environments, collections, and
  API requests.
- The singleton connection, write queue, and batch transaction primitives occupy the same module as
  all row mapping and domain SQL.
- Store imports are already domain-oriented, so repository boundaries map directly to current
  consumers.

Recommended boundary:

```text
src/lib/db/
  core.ts                 getDb, enqueueWrite, runBatch
  settings.repository.ts
  notes.repository.ts
  snippets.repository.ts
  prompt-templates.repository.ts
  history.repository.ts
  folders.repository.ts
  api.repository.ts
src/lib/db.ts             compatibility facade/re-exports
```

Only `core.ts` should load the database. Repositories should call the exported singleton and share
the same serialized write queue; they must not instantiate connections. Keep `src/lib/db.ts` as the
public import path during migration to avoid a repo-wide consumer rewrite.

This change requires updating the repository contract that currently says all SQLite access lives
in the single `src/lib/db.ts` file. Preserve the intent—one connection gateway—even if SQL moves to
the internal repository files.

Expected payoff: domain SQL and row mappings can change independently, tests can follow the same
domain split, and merge conflicts decrease. This is primarily a maintainability change; because
stores are currently loaded at bootstrap, it will not by itself shrink the initial bundle.

### P1 — Make Monaco and heavyweight shell features explicit loading boundaries

Evidence:

- `useMonaco.ts` is only 584 source lines, but its shared output is 3.87 MB minified because it
  side-effect imports `monaco-runtime.ts`, which imports the full `monaco-editor` entry and five
  worker constructors.
- The manifest associates the chunk with 18 tool entries and dynamic registrations for the entire
  basic-language catalog.
- The existing Vite comment correctly avoids a manual Monaco chunk that would make the entry load
  it statically.
- `Providers` nevertheless idle-imports `MarkdownEditor` after every successful bootstrap, which
  causes the Monaco chunk to be prefetched without the user opening an editor.
- `SettingsPanel` statically imports all tabs. The closed Data tab brings API backup/import code,
  GraphQL, and YAML into the 1.31 MB initial entry.

Recommended work, in measurement order:

1. Record cold-start requests, first-editor latency, and memory before changing chunk rules.
2. Remove or narrow the unconditional Markdown Editor idle preload. If preloading is valuable, base
   it on restored tabs or recent-tool history rather than every session.
3. Lazy-load settings tab bodies, especially Data and Acknowledgments. The dialog shell and tab
   metadata can remain initial. **Implemented in this PR for Data and Acknowledgments.**
4. Split Monaco code by concern (`runtime`, `theme-building`, `preferences`) for testability, then
   replace the full `monaco-editor` entry with the editor API plus an explicit devdrivr language
   registry. Load language contributions/services only when a model needs them.
5. Investigate whether TypeScript Playground can reuse Monaco's TypeScript language service before
   retaining two separate 7+ MB TypeScript worker assets. This is a feasibility spike, not an
   assumed win: the workers have different APIs and lifecycles.

Do not start with `manualChunks`. The current code comment documents a previous eager-loading
regression, and a renamed large chunk would not reduce bytes or parse work.

Expected payoff: lower routine startup and idle memory cost, a smaller initial entry, and Monaco
language capabilities that can evolve without a single all-language runtime surface.

### P2 — Extract the image processing state machine from `ImageTool`

Evidence:

- The main component is 1,273 lines even though four bottom panels are already separate local
  components.
- It owns decode limits, object URL and `ImageBitmap` lifetime, restore races, canvas rendering,
  resize coupling, crop pointer/keyboard interactions, export, clipboard, undo, and JSX.
- Crop interaction alone spans multiple refs and callbacks across more than 200 lines.

Recommended boundary:

```text
src/tools/image-tool/
  image-model.ts              types, limits, clamp/transform helpers
  image-renderer.ts           pure canvas render/export operations
  hooks/useLoadedImage.ts     decode, restore, URL/bitmap lifetime
  hooks/useCropInteraction.ts pointer/keyboard crop state machine
  components/*Panel.tsx       existing panels moved out of the entry file
```

Keep Canvas 2D and the current platform APIs. The goal is lifecycle isolation, not a new image
dependency.

Expected payoff: geometry and render tests become independent from React, resource cleanup is
centralized, and UI changes no longer risk decode/export behavior.

### P2 — Consolidate note behavior across workspace and drawer

Evidence:

- `NotesWorkspace.tsx` is 1,310 lines and `NotesDrawer.tsx` is 1,074 lines.
- Together they contain 46 note-store selectors and separate edit/save/error/selection behavior.
- Both implement the same relative-time calculation locally.
- The full workspace already has feature-local modules for task models, wiki links, attachments,
  and Markdown behavior; the drawer still includes a 247-line local `NoteEditor` plus its own
  Markdown renderer.

Recommended boundary:

- Share a feature-local note selection/editing model and small pure presentation helpers.
- Move drawer-specific editor/list sections into `src/tools/notes/components/` or a neutral
  `src/features/notes/` only if both shell and tool imports remain acyclic.
- Keep Monaco workspace editing and lightweight drawer editing as separate views; forcing both into
  one configurable component would create prop-driven complexity.
- Move `timeAgo` only as part of this work. A utility created solely to remove three ten-line
  functions is not independently valuable.

Expected payoff: one definition of save/error and note metadata behavior, with deliberate separate
views for different interaction contexts.

### P2 — Split `api-import.ts` by format adapter

Evidence:

- One 1,112-line file parses devdrivr JSON, Postman, OpenAPI, AsyncAPI, Protobuf, and GraphQL.
- It mixes format detection, parser-specific traversal, normalization, limits, and shared result
  building.
- It is reachable from the initial bundle through the closed Settings Data tab.

Recommended boundary:

```text
src/lib/api-import/
  index.ts              detect and dispatch
  builder.ts            shared limits, normalization, result builder
  devdrivr.ts
  postman.ts
  openapi.ts
  asyncapi.ts
  protobuf.ts
  graphql.ts
```

Keep current exported types and `importApiSpec` facade stable. After the source split, dynamically
import parser adapters where practical so GraphQL or YAML parsing is paid for only by matching
imports. Split tests by adapter while retaining cross-format contract tests.

Expected payoff: isolated format changes and a straightforward route to parser-level code
splitting.

### P2 — Finish the MCP split at infrastructure and discovery seams

The old monolith has already been materially improved. `service/mod.rs` is not a remaining
8,000-line production service: 1,222 of its 2,798 lines are tests, and CRUD tool handlers already
live in resource modules. The next change should therefore be modest.

Recommended boundary:

- Move resource fetch/value conversion and shared mutation receipts into a `resources.rs` or
  similarly focused module.
- Move folder subtree persistence into the existing `folders.rs` boundary if it does not create
  cyclic imports.
- Move the 1,222-line inline test module to `service/tests/` grouped by permissions, resources,
  folders, and redaction.
- Split `discovery.rs` into search and help/introspection only when either area next changes.

Do not redistribute helpers merely to reduce `mod.rs` below an arbitrary line count. Router
composition, bounded dispatch, and the service struct belong together and are currently easy to
find.

Expected payoff: easier Rust navigation and smaller test recompilation/review surfaces without
undoing the resource-router design.

### P3 — Continue existing validator extraction, but stop short of a generic validator framework

`CssValidator` and `HtmlValidator` already share `ProblemsList`, `useValidatorDocument`, formatter
workers, and similar editor/file lifecycles. XML, YAML, JSON Schema, CSS, and HTML still repeat some
debounce and document-action wiring, but their result models and secondary panes differ
substantially.

Recommended work:

- Extend a saved-document hook only for identical open/save/dirty/editor-mount behavior.
- Add a small reusable debounced-value hook if the next tool repeats the existing 200-250 ms source
  snapshot pattern.
- Keep parser/analyzer state and results panels feature-specific.

Expected payoff: removes risky lifecycle repetition without building a lowest-common-denominator
validator component.

### P3 — Extract pure model code from mixed tool files when those tools next change

Good opportunistic candidates:

- `ColorConverter.tsx`: move the approximately 680 lines before the component into
  `color-model.ts` and test conversions without rendering.
- `PromptTemplates.tsx`: move `VariableForm`, `PreviewPane`, `QuickFillModal`, and
  `TemplateEditorModal` to feature-local components; keep the main component as orchestration.
- `WorkspaceTabStrip.tsx`: isolate drag/reorder and context-menu focus behavior into hooks before
  adding more tab interactions.
- `CollectionsSidebar.tsx`: separate tree view state from collection/request commands.

These are worthwhile, but they rank below the P1/P2 items because they either already have a clear
pure/UI split or change less central behavior.

## Healthy boundaries to preserve

- Tool components are lazy-loaded from a central registry. Keep this single source of truth.
- Shared controls, layouts, file actions, tool actions, handoff, and worker RPC already prevent
  broad duplication.
- Markdown Editor demonstrates the preferred feature-folder shape: entry component, pure model
  modules, hooks, and modal components colocated by feature.
- MCP resource routers are a successful vertical split. Keep tool registration near each resource.
- Zustand stores are mostly domain-focused and use selector functions. Do not merge them into a
  global application store.
- Workers are isolated behind `useWorker` and `?worker` imports. Preserve those runtime boundaries.
- Large pure tables, generated assets, and focused test files are not refactor targets based on
  line count alone.

## SWOT snapshot

| Strengths                                                          | Weaknesses                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Clear tool registry and lazy tool entries                          | Several 700-1,800-line stateful React functions                     |
| Strong shared UI and platform primitives                           | One persistence module owns every domain's SQL                      |
| Feature-local modularity already proven in Markdown and API Client | Closed settings tabs enlarge the initial dependency graph           |
| MCP resource routers replace the former monolith                   | Monaco runtime/language scope is broader than the app usually needs |

| Opportunities                                                     | Threats                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Extract along existing feature seams with little public API churn | Big-bang rewrites could disturb persistence and editor lifecycle behavior       |
| Lazy settings/parser adapters and explicit Monaco languages       | Generic hooks/components could hide important per-tool differences              |
| Pure services allow faster, narrower tests                        | Moving SQL without preserving the singleton/write queue can corrupt assumptions |
| Shared note domain behavior can serve two views                   | Chunk renaming can look like optimization while preserving the same cost        |

## Suggested execution order

1. **Measure and adjust loading boundaries.** The heavy settings tabs are split in this PR; next,
   add a repeatable bundle report and decide whether the Markdown Editor idle preload is
   intentional.
2. **Extract API request execution.** Move pure request/response work and collection reuse first;
   then split panes.
3. **Extract Snippets feature slices.** Start with pure library/filter and fragment models, then UI
   panels and lifecycle hooks.
4. **Split database repositories.** Preserve the public facade and serialized connection/write
   invariants; update the repository contract in the same PR.
5. **Extract Image Tool lifecycle/geometry.** Keep rendering behavior unchanged and validate with
   its existing comprehensive test suite.
6. **Consolidate note domain behavior.** Share logic, not a single configurable view.
7. **Split API import adapters.** Follow with adapter-level dynamic imports if bundle measurements
   justify them.
8. **Take opportunistic P3 extractions** only when the relevant feature is already being changed.

Use one focused PR per numbered item. Preserve behavior first; bundle optimization and public
facade changes should each have before/after measurements.

## Definition of done for follow-up refactors

- The tool entry component reads as composition and high-level orchestration.
- Pure domain logic has direct tests that do not render Monaco or the full application shell.
- Async ownership is explicit: cancellation, timers, object URLs, workers, and persistence flushes
  have one lifecycle owner.
- Existing import paths remain stable or are migrated atomically.
- No new cross-feature “common” module is introduced without at least two real consumers.
- Bundle work reports initial, first-use, and worker costs separately.
- Typecheck, unit tests, lint, tool contract audit, and rendered audit are run as applicable.
