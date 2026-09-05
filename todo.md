# Snippets, API Client, and Notes roadmap

Reviewed 2026-09-05 against the massCode 5.10.0 documentation. This is a
prioritized implementation plan, not a parity checklist: items are ordered by
user impact, data/security risk, how much later work they unlock, and estimated
delivery cost.

## Current-state assessment

| Area       | devdrivr strengths today                                                                                                                                                                                                                                                                      | Highest-value gaps versus massCode                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snippets   | Monaco editing, language selection, fuzzy full-content search, flat folders, tags, favorites, sorting, duplicate/copy/download, JSON backup/restore, and cross-tool handoff                                                                                                                   | Multi-file fragments, descriptions, nested folders, durable trash, formatting, and HTML/CSS or JSON previews                                         |
| API Client | Saved requests and collections, search/history, query params, toggleable headers, JSON/text/urlencoded/multipart bodies, bearer/basic auth, environment interpolation, cURL copy, response inspection/download, collection runner, and broad Postman/OpenAPI/AsyncAPI/protobuf/GraphQL import | Keychain-backed secrets, request descriptions, raw outgoing-request preview, hierarchical collections, and richer environment import/export          |
| Notes      | Always-available resizable drawer, autosave, Markdown rendering, fuzzy search, tags, colors, pinning, manual ordering, word count, copy, and cross-tool handoff                                                                                                                               | A full writing workspace, editor/preview modes, folders/favorites/trash, task metadata and smart views, internal links/backlinks, and managed images |

The comparison is based on massCode's documented [Code](https://masscode.io/documentation/code/),
[Notes](https://masscode.io/documentation/notes/), and
[HTTP](https://masscode.io/documentation/http/) workspaces. MassCode's notable
reference features include [snippet fragments and descriptions](https://masscode.io/documentation/code/fragments.html),
[structured note tasks](https://masscode.io/documentation/notes/tasks.html),
[cross-resource internal links](https://masscode.io/documentation/notes/internal-links.html),
and [keychain-backed HTTP secret variables](https://masscode.io/documentation/http/environments.html).

## Prioritized top 10

### 1. Secure API environment secrets

**Outcome:** Users can reference tokens and passwords as `{{variables}}` without
persisting secret values in SQLite, exports, request history, logs, or copied
previews.

- [ ] Add a Tauri command layer backed by the operating-system credential store.
      Keep secret resolution and secret-bearing request assembly/execution in
      Rust; return only redacted request diagnostics to the WebView.
- [ ] Extend environment variables with secret metadata while storing only a
      stable secret reference in SQLite. Add and backfill a migration for existing
      rows.
- [ ] Resolve secrets only inside the Rust send command. Never place plaintext in
      Zustand/tool state, drafts, preview builders, history, exports, logs, errors,
      or collection-run results.
- [ ] Make reveal a separate, narrowly scoped command requiring an explicit user
      action; do not expose secret enumeration or bulk plaintext reads.
- [ ] Add an explicit conversion flow for a plaintext variable, warning that old
      database copies or backups may still contain the value.
- [ ] Add capability permissions and Rust/TypeScript tests for locked credential
      stores, missing secrets, masking, conversion, and deletion.

**Depends on:** none. **Risk:** high; complete a threat-model review before
release. **Done when:** a repository/SQLite search after exercising the feature
cannot find the test secret, and requests still resolve it correctly.

### 2. First-class Notes workspace with editor modes

**Outcome:** Notes support sustained Markdown writing without losing the current
drawer's fast capture workflow.

- [ ] Register a lazy-loaded `notes` tool with a responsive library/list/editor
      layout; keep the drawer as a compact view over the same store and records.
- [ ] Reuse the shared Monaco and sanitized Markdown pipeline for Editor, split
      Live Preview, and read-only Preview modes.
- [ ] Support fenced-code highlighting, GFM tables/task lists, copyable code
      blocks, editor preferences, dirty-state handling, and keyboard shortcuts.
- [ ] Make selection and draft state tab-instance-safe; flush pending drawer and
      workspace saves when switching surfaces.
- [ ] Add component, persistence, keyboard, accessibility, and narrow-layout tests.

**Depends on:** none. **Unlocks:** items 5, 6, and 8. **Done when:** the same note
can be edited in either surface without stale overwrites, and all three modes
render sanitized Markdown consistently.

### 3. Shared hierarchical library and folder model

**Outcome:** Notes, snippets, and API requests scale beyond flat folder strings
or one-level collections while retaining simple Inbox and All Items views.

- [ ] Introduce typed resource folders with parent ID, stable ordering, resource
      kind, and optional default language for snippet folders.
- [ ] Migrate snippet folder strings and API collections without changing visible
      names; place current unfiled notes in Inbox.
- [ ] Build a reusable accessible tree supporting create, inline rename, nesting,
      keyboard movement, pointer movement, and subtree filtering.
- [ ] Do not expose folder deletion until item 4 lands; folder creation, rename,
      nesting, and movement can ship without committing to destructive behavior.
- [ ] Update import/export and MCP representations so hierarchy round-trips.

**Depends on:** none, but land before items 4-6 to avoid repeated schema/UI
rewrites. **Risk:** medium-high migration scope. **Done when:** nested hierarchy
survives restart and export/import for all three resources.

### 4. Durable Trash, restore, and empty-trash workflows

**Outcome:** Accidental deletion is recoverable after the current eight-second
snippet undo window and across application restarts.

- [ ] Add `deleted_at` to notes, snippets, API requests, and folders, with explicit
      backfills and indexes for live/trash queries.
- [ ] Change delete actions to soft-delete and add Trash views, restore, permanent
      delete, and empty-trash confirmation. Trashing a folder marks its entire
      subtree and contained resources in one transaction while retaining parent
      IDs; restoring that folder restores the subtree intact.
- [ ] Preserve the original folder/collection for individually deleted resources;
      restore to Inbox only when the original parent no longer exists.
- [ ] Exclude trashed items from search, MCP reads, runners, links, and exports by
      default; provide deliberate inclusion where useful.
- [ ] Cover cascading folder behavior, concurrent autosaves, restore conflicts,
      and permanent deletion in DB/store/UI tests.

**Depends on:** item 3. **Done when:** deleted content remains recoverable after
restart, folder subtrees restore intact, and trashed content cannot be executed,
linked, or exported accidentally.

### 5. Structured tasks inside Notes

**Outcome:** A note can carry actionable status without becoming a separate task
system.

- [ ] Add optional task fields for status (`todo`, `in_progress`, `done`,
      `blocked`), priority, and due date, including a complete migration backfill.
- [ ] Support new task, note-to-task, and task-to-note flows with explicit removal
      confirmation for task metadata.
- [ ] Add All, Today, Upcoming, Completed, and Overdue views plus quick completion
      from list rows.
- [ ] Keep tasks searchable and available in normal note folders/tags; add hide-
      completed and soft-delete-completed actions.
- [ ] Test timezone boundaries, overdue rules, sorting, conversion, cleanup, and
      MCP serialization.

**Depends on:** items 2-4. **Done when:** task views are derived consistently from
local dates and no conversion discards note title/body/folder/tags.

### 6. Wiki links, backlinks, and cross-resource navigation

**Outcome:** Notes can connect local knowledge to other notes, snippets, and saved
API requests using `[[target]]` links.

- [ ] Define stable link syntax and resolution by resource ID, while inserting a
      readable shortest unambiguous label/path.
- [ ] Add an accessible `[[` autocomplete picker spanning notes, snippets, and API
      requests, with keyboard navigation and resource/location labels.
- [ ] Render safe internal links in preview and open the exact destination through
      the existing tab/handoff infrastructure.
- [ ] Parse outgoing links and expose backlinks; update indexes on rename, move,
      delete, restore, and content save.
- [ ] Handle duplicate titles, broken links, renamed targets, trashed targets, and
      legacy content in tests.

**Depends on:** items 2-4. **Done when:** links survive target rename/move and a
user can navigate forward and back without ambiguous routing.

### 7. Multi-fragment snippets with descriptions

**Outcome:** One snippet can hold related files, language variants, or examples,
plus usage context, without title/tag conventions.

- [ ] Split snippet content into ordered fragment records with name, language,
      content, and timestamps; migrate each existing snippet into one fragment.
- [ ] Add accessible fragment tabs with create, rename, reorder, duplicate, and
      guarded delete actions.
- [ ] Add an optional Markdown description at snippet level, collapsed when empty.
- [ ] Update search, copy/download, duplication, import/export, MCP, and cross-tool
      handoff semantics for one fragment versus the full snippet.
- [ ] Preserve per-fragment debounced saving and prove that rapid tab switches do
      not lose edits.

**Depends on:** item 3; coordinate with item 4 for deletion semantics. **Done
when:** legacy snippets migrate losslessly and a multi-fragment backup round-trips
with ordering and languages intact.

### 8. Managed image attachments for Notes

**Outcome:** Screenshots and diagrams can be pasted or dropped into a note and
remain available offline.

- [ ] Add a Tauri-managed notes asset directory with collision-safe names, atomic
      writes, size/type limits, and path traversal protection.
- [ ] Handle clipboard paste and file drop in the Notes editor, inserting portable
      app asset URLs or relative Markdown references.
- [ ] Resolve assets through a narrowly scoped Tauri protocol/capability and keep
      remote images subject to the existing sanitized Markdown policy.
- [ ] Include assets in note backup/export; detect references before deletion and
      offer orphan cleanup rather than deleting shared files automatically.
- [ ] Test Unicode filenames, duplicate names, missing files, malicious paths,
      large files, export/restore, and offline rendering.

**Depends on:** item 2. **Risk:** high filesystem/security surface. **Done when:**
a pasted image renders after restart and survives a full backup/restore.

### 9. API request descriptions and outgoing-request preview

**Outcome:** Saved requests explain their purpose and can be inspected or shared
exactly as they will be sent.

- [ ] Add a Markdown description field to request models, migration, store,
      import/export, MCP, and search.
- [ ] Add a Preview tab with raw HTTP and cURL views derived from the same resolved
      request builder used for execution.
- [ ] Show unresolved variables and masked secrets consistently; never maintain a
      second interpolation/auth/body implementation just for preview.
- [ ] Import Postman/OpenAPI descriptions where available and preserve them on
      round-trip export.
- [ ] Add golden tests covering query encoding, repeated headers/params, auth,
      every body mode, environment variables, and secret masking.

**Depends on:** item 1 for safe secret handling. **Done when:** preview and the
sent request share a canonical serialized representation apart from transport-
added headers.

### 10. Snippet formatting and contextual previews

**Outcome:** Common snippets can be cleaned up and inspected without leaving the
library.

- [ ] Use Monaco's registered document formatters first; add language-specific
      formatting dependencies only where platform/editor support is insufficient.
- [ ] Add a sandboxed HTML/CSS preview that composes selected fragments and blocks
      privileged Tauri access, navigation, and unexpected network access.
- [ ] Reuse the existing JSON visualization tool through `sendToTool` instead of
      building a second renderer; preserve the current fragment selection.
- [ ] Provide format/preview commands, shortcuts, disabled-state explanations,
      syntax-error feedback, and unsaved-edit safety.
- [ ] Test formatter failures, unsupported languages, CSP/sandbox boundaries,
      multi-fragment composition, and handoff behavior.

**Depends on:** item 7. **Risk:** medium due to executable preview content. **Done
when:** supported code formats predictably and previews cannot access Tauri IPC.

## Recommended delivery sequence

1. **Foundation and safety:** 1, 2, 3, 4
2. **Core knowledge workflows:** 5, 6, 7
3. **Richer content and inspection:** 8, 9, 10

Each numbered item should ship as its own feature branch and PR. Schema changes
must include explicit backfills in the same migration, and every PR must update
MCP behavior and import/export contracts where the affected resource is exposed.
Keep all frontend SQLite access in `src/lib/db.ts` through `getDb()`; tools and
Zustand stores must call those helpers rather than issue SQL. Every new store
`init()` must use the repository's idempotent promise guard.

## Explicitly deferred after the top 10

- Notes dashboard, activity heatmap, knowledge graph, mind map, and presentation
  mode: useful after the Notes workspace and link graph exist, but lower value
  than safe editing, tasks, links, and attachments.
- Browser clipper and multi-device sync: conflict with the current local-first,
  no-account boundary and require separate product/security decisions.
- Custom folder icons and compact list density: polish after scalable hierarchy.
- Bruno import and Postman environment companion files: worthwhile import
  follow-ups, but current format coverage is already strong and secure environment
  storage should land first.
- MassCode-compatible Markdown-vault storage: a major persistence strategy change,
  not a feature-level addition to the existing SQLite architecture.
