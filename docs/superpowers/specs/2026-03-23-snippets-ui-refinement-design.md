# Spec: Snippets UI Refinement — "The Terminal Cockpit"

**Date:** 2026-03-23
**Status:** Draft
**Topic:** UI Refinement of the Snippets Manager tool in `devdrivr cockpit`.

---

## 1. Objective
Transform the `SnippetsManager` into a high-contrast, 3-pane "terminal" interface that aligns with the "cockpit" aesthetic. The goal is to maximize information density, keyboard-centricity, and visual consistency using retro-terminal patterns.

---

## 2. Architecture & Layout

### 2.1 The 3-Pane Grid
The tool will be restructured into three vertical panes separated by `1px solid var(--color-border)`:

1.  **Selection Pane (Left, 250px):** `[ 01-SELECT ]`
    -   Contains the search bar and the snippet list.
    -   Active snippet is highlighted with a solid `var(--color-accent)` background and `var(--color-bg)` text.
    -   Favorites marked with ASCII `[*]` instead of emojis.
    -   Language shorthand shown in brackets, e.g., `[JS]`.

2.  **Editor Pane (Center, Flexible):** `[ 02-EDIT: <filename> ]`
    -   The main Monaco editor area.
    -   Header dynamically shows the title and derived extension (e.g., `db_init.sql`).
    -   Clean "Zen" configuration (no minimap, minimal chrome).

3.  **Meta Pane (Right, 200px):** `[ 03-META ]`
    -   Vertical list of tags with `[X]` delete buttons.
    -   Language selector (stylized).
    -   Live stats block: `L:{lines} C:{chars} B:{bytes}`.

### 2.2 Bottom Command Bar
A persistent `50px` bar at the bottom of the tool:
-   Styled like classic DOS/Terminal file managers.
-   Labels: `[F5: NEW] [F6: DUP] [F8: DEL] [F9: EXP] [F10: IMP]`.
-   Includes status indicators like `[SAVING...]` or `[FAV]`.

---

## 3. Visual Language
-   **Typography:** Use `font-pixel` for all headers, buttons, and status labels.
-   **Borders:** All panes and the bottom bar are framed with `var(--color-border)`.
-   **Colors:** Use CSS variables (`--color-accent`, `--color-surface`, etc.) exclusively. No hardcoded hex codes.
-   **Icons:** Replace emojis/SVG icons with ASCII or `Phosphor` icons where appropriate, prioritizing a "blocky" look.

---

## 4. Interaction Patterns
-   **Keyboard First:** Shortcuts (`Cmd+N`, `Cmd+F`) are the primary drivers.
-   **F-Key Simulation:** Clicking the labels in the bottom Command Bar triggers the corresponding actions.
-   **Focus Management:** Creating a new snippet automatically focuses the title input.

---

## 5. Implementation Notes
-   Utilize `Tailwind CSS 4` for the grid and flex layouts.
-   Maintain the debounced persistence logic in `snippets.store.ts`.
-   Ensure `npx tsc --noEmit` and `bun run test` pass after restructuring.
-   No new Tauri windows; all panes reside within the existing `SnippetsManager` component.
