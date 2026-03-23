# Chameleon Mascot Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Chameleon mascot into a high-fidelity, theme-aware SVG with passive animations.

**Architecture:** Use a 40x36 pixel art grid partitioned into `body`, `tail`, and `eye` groups. Each group is wrapped in an SVG `<g>` for efficient CSS-driven animations (breathing, blinking).

**Tech Stack:** React 19, Tailwind CSS 4, CSS Keyframes.

---

### Task 1: Sprite Grid & Palette Update

**Files:**
- Modify: `apps/cockpit/src/components/shared/Chameleon.tsx`

- [ ] **Step 1: Redesign the 40x36 grid.** Implement a refined silhouette with a curved tail and 4-step shading ramps for greens and browns.

```tsx
// Example updated GRID (simplified)
const GRID = [
  // 40 rows of 40 numbers
  // 0: transparent
  // 1-4: greens (outline, shadow, base, highlight)
  // 5-8: browns (outline, shadow, base, highlight)
  // 9: eye color
]
```

- [ ] **Step 2: Define Theme-Aware Colors.** Update `COLORS` to use CSS variables for better contrast in light/dark modes.

```tsx
const COLORS: Record<number, string> = {
  1: 'var(--color-mascot-green-outline)',
  // ...
  5: 'var(--color-mascot-brown-outline)',
  // ...
}
```

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/components/shared/Chameleon.tsx
git commit -m "feat(chameleon): upgrade to 40x36 grid and theme-aware palette"
```

---

### Task 2: Partitioning & Grouped Rendering

**Files:**
- Modify: `apps/cockpit/src/components/shared/Chameleon.tsx`

- [ ] **Step 1: Implement pixel grouping.** Categorize each pixel in `RECTS` into `body`, `tail`, or `eye`.

```tsx
type PixelGroup = 'body' | 'tail' | 'eye'
const RECTS: { x: number; y: number; fill: string; group: PixelGroup }[] = []
// ... logic to assign groups based on grid positions
```

- [ ] **Step 2: Update SVG Rendering.** Wrap each group in a `<g>` tag with a corresponding class.

```tsx
<g className="chameleon-body">
  {RECTS.filter(r => r.group === 'body').map(...)}
</g>
```

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/components/shared/Chameleon.tsx
git commit -m "feat(chameleon): implement pixel grouping for granular animation"
```

---

### Task 3: Passive Animations (CSS Keyframes)

**Files:**
- Modify: `apps/cockpit/src/components/shared/Chameleon.tsx`

- [ ] **Step 1: Add Animation CSS.** Define keyframes for blinking and breathing.

```css
@keyframes chameleon-blink {
  0%, 95%, 100% { fill: var(--eye-color); }
  97% { fill: var(--skin-color); }
}

@keyframes chameleon-breathing {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(0.5px); }
}
```

- [ ] **Step 2: Apply classes.** Add classes to the SVG groups and eye pixels.

- [ ] **Step 3: Commit.**
```bash
git add apps/cockpit/src/components/shared/Chameleon.tsx
git commit -m "feat(chameleon): add passive blink and breathing animations via CSS"
```

---

### Task 4: Final Polish & Sidebar Verification

**Files:**
- Modify: `apps/cockpit/src/components/shell/Sidebar.tsx`

- [ ] **Step 1: Verify layout.** Ensure the new 40x36 sprite fits perfectly in the Sidebar's 60x54 display.

- [ ] **Step 2: Run verification commands.**
Run: `npx tsc --noEmit && bun run test`

- [ ] **Step 3: Final Commit.**
```bash
git add apps/cockpit/src/components/shared/Chameleon.tsx apps/cockpit/src/components/shell/Sidebar.tsx
git commit -m "feat(chameleon): final polish and layout verification"
```
