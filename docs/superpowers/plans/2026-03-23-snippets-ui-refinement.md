# Snippets UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Snippets Manager into a 3-pane retro-terminal interface with a bottom F-key command bar.

**Architecture:** Use a CSS grid layout to create three distinct, bordered panes (Select, Edit, Meta) and a fixed bottom bar. The central Editor pane will be flexible, while the side panes remain fixed.

**Tech Stack:** React 19, Tailwind CSS 4, Monaco Editor, Zustand 5.

---

### Task 1: Component Restructuring (Layout Shell)

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

- [ ] **Step 1: Define the high-level grid structure.** Wrap the current content in a container that supports the 3-pane layout and the bottom bar.

```tsx
<div className="flex h-full flex-col overflow-hidden bg-[var(--color-bg)]">
  <div className="flex flex-1 overflow-hidden">
    {/* Pane 1: Selection */}
    <div className="flex w-64 shrink-0 flex-col border-r border-[var(--color-border)]">...</div>
    {/* Pane 2: Editor */}
    <div className="flex flex-1 flex-col border-r border-[var(--color-border)]">...</div>
    {/* Pane 3: Meta */}
    <div className="w-52 shrink-0 overflow-auto">...</div>
  </div>
  {/* Command Bar */}
  <div className="h-10 border-t border-[var(--color-border)] bg-[var(--color-surface)]">...</div>
</div>
```

- [ ] **Step 2: Add Panel Headers.** Add `[ 01-SELECT ]`, `[ 02-EDIT ]`, and `[ 03-META ]` headers to each pane using the `font-pixel` class.

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: restructure snippets manager into 3-pane grid layout"
```

---

### Task 2: Refine Selection Pane (`[ 01-SELECT ]`)

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

- [ ] **Step 1: Style the Snippet List Items.** Implement high-contrast active state (solid accent background) and ASCII markers for favorites `[*]`.

```tsx
<button className={`... ${selectedId === snippet.id ? 'bg-[var(--color-accent)] text-[var(--color-bg)]' : 'hover:bg-[var(--color-surface-hover)]'}`}>
  <span>{isFavorite(snippet.tags) ? '[*] ' : ''}{snippet.title}</span>
  <span className="text-[10px] opacity-70">[{snippet.language.toUpperCase()}]</span>
</button>
```

- [ ] **Step 2: Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: refine selection pane with high-contrast active states and ASCII markers"
```

---

### Task 3: Refine Editor Pane (`[ 02-EDIT ]`)

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

- [ ] **Step 1: Dynamic Header.** Update the editor header to show the snippet title and extension based on the language.

```tsx
const ext = LANG_EXTENSIONS[selected.language] || 'txt';
const displayTitle = `[ 02-EDIT: ${selected.title}.${ext} ]`;
```

- [ ] **Step 2: Clean Editor Config.** Ensure the Monaco Editor `options` has `minimap: { enabled: false }` and `lineNumbers: 'on'`.

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: add dynamic editor header and clean monaco config"
```

---

### Task 4: Implement Meta Pane (`[ 03-META ]`)

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

- [ ] **Step 1: Vertical Tag List.** Move tags from the editor header to a vertical list in the right pane.

- [ ] **Step 2: Stats Block.** Implement the `L:{lines} C:{chars} B:{bytes}` block at the bottom of the Meta pane.

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: implement meta pane with vertical tags and live stats"
```

---

### Task 5: Implement Bottom Command Bar

**Files:**
- Modify: `apps/cockpit/src/tools/snippets/SnippetsManager.tsx`

- [ ] **Step 1: Command Bar Labels.** Add the `[F5: NEW] [F6: DUP] [F8: DEL] [F9: EXP] [F10: IMP]` labels.

- [ ] **Step 2: Status Indicators.** Add `[SAVING...]` and `[FAV]` indicators that appear based on state.

- [ ] **Step 3: Click Handlers.** Bind the labels to the existing handler functions (`handleNew`, `handleDelete`, etc.).

- [ ] **Step 4: Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: add bottom command bar with F-key labels and status indicators"
```

---

### Task 6: Final Polish & Verification

**Files:**
- Modify: `apps/cockpit/src/tools/__tests__/snippets.test.tsx`

- [ ] **Step 1: Run verification commands.**
Run: `npx tsc --noEmit && bun run test`

- [ ] **Step 2: Fix any failing tests.** Update test selectors if the new layout changed them.

- [ ] **Step 3: Final Commit.**
```bash
git add apps/cockpit/src/tools/snippets/SnippetsManager.tsx
git commit -m "ui: final polish and test verification for snippets ui refinement"
```
