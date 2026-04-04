# API Client Improvements — Design Spec

**Date:** 2026-04-04  
**Scope:** `apps/cockpit/src/tools/api-client`

---

## Current Deficiencies

| # | Issue | Current Behaviour | Root Cause |
|---|-------|-------------------|------------|
| 1 | Save / Save As uses `window.prompt()` | Native browser dialogs for name + collection | `handleSave` / `handleSaveAs` call `prompt()` |
| 2 | `handleSave` loses collection | Saves existing request into `Default` collection | Hardcoded `collections.find(c => c.name === 'Default')` instead of reading stored collectionId |
| 3 | No "New Request" button | No way to clear editor and start fresh | Missing action in UI |
| 4 | Cannot move request to collection | Sidebar has only Delete; no Move/Assign | CollectionsSidebar has no update-request affordance |
| 5 | Cannot rename a collection | Only Create + Delete available | No inline edit in CollectionsSidebar |

---

## Top 3 Improvements

### 1. Request History
After each successful `Send`, log the request and response summary to the existing `history` table (`tool = 'api-client'`). Show a collapsible **History** section at the bottom of the sidebar (last 30 entries). Each entry shows: method badge · truncated URL · status code · time. Click to restore into draft.

### 2. Rename Collection (inline)
Double-click a collection name in the sidebar to enter inline edit mode (contentEditable or a focused input that replaces the label). Press Enter or blur to commit; Escape to cancel. Calls `updateCollection` in the store.

### 3. Duplicate Request
Hover menu on each saved request gains a **Duplicate** option alongside Delete. Creates a copy prefixed `"Copy of "` in the same collection and selects it.

---

## Architecture

### New File: `SaveRequestModal.tsx`

Replaces all `prompt()` calls. Props:

```ts
type Props = {
  mode: 'save' | 'save-as'
  initialName: string
  initialCollectionId: string | null
  collections: ApiCollection[]
  onSave: (name: string, collectionId: string | null) => void
  onClose: () => void
}
```

UI:
- Request name `<input>`
- Collection `<select>` listing all collections + `"(Unassigned)"` + `"+ New Collection…"`
- When `"+ New Collection…"` is chosen: an inline text input appears below for the new collection name
- Save / Cancel buttons; keyboard: Enter = save, Escape = cancel

### `ApiClient.tsx` changes
- New state: `showSaveModal: boolean`, `saveMode: 'save' | 'save-as'`
- `handleSave` opens modal with `mode = 'save'`, pre-filling collectionId from `requests.find(r => r.id === activeRequestId)?.collectionId`
- `handleSaveAs` opens modal with `mode = 'save-as'`, initial name from draft
- Modal `onSave` callback does the actual create/update
- New **"+ New"** button in header row resets draft to defaults and clears `activeRequestId`
- After each successful send: call `addHistoryEntry()` with method, URL, status, time JSON-encoded in `input`/`output`

### `CollectionsSidebar.tsx` changes

**Inline collection rename:**
- State: `editingColId: string | null`, `editingColName: string`
- Double-click label → set `editingColId`, show `<input>` pre-filled; Enter/blur commits; Escape cancels

**Request hover menu:**
- Expand hover row to show a `⋮` button; clicking opens a small absolute-positioned dropdown with: **Move to Collection** / **Duplicate** / **Delete**
- Move to Collection: shows a secondary dropdown of all collection names + Unassigned

**History section:**
- Below collections: collapsible `History` header (▶/▼)
- Loads 30 entries on init via `loadHistory('api-client', 30)` from `db.ts`
- On parent `handleSend` success, history is refreshed (store or callback)
- Each row: method badge · URL (truncated) · status · `Xms`

### `api.store.ts` changes
- Add `history: HistoryEntry[]` to state
- `init()` loads history via `loadHistory('api-client', 30)`
- Add `addHistoryEntry(entry)` action (saves to DB, prepends to in-memory array, prunes to 30)
- Export `HistoryEntry` type re-export via models or import from db directly

### No schema migration needed
The `history` table already exists with `id, tool, sub_tab, input, output, timestamp`. Format for API client entries:
- `sub_tab`: HTTP method (e.g. `GET`)
- `input`: `"GET https://example.com/api"` (method + URL)
- `output`: `"200 OK · 123ms · 4.2 KB"` (status summary)

---

## Component Interaction Diagram

```
ApiClient
  ├── CollectionsSidebar
  │   ├── collection rows (double-click to rename)
  │   │   └── request rows (hover ⋮ → Move / Duplicate / Delete)
  │   └── History section (collapsible, last 30 sends)
  ├── SaveRequestModal (conditional)
  └── EnvironmentModal (existing, unchanged)
```

---

## Out of Scope
- Drag-and-drop reordering of collections/requests
- Request folders/nesting beyond single collection level
- Import from Postman/Insomnia format
- Response history per saved request
