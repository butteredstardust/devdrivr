# Spec: Chameleon Mascot Refinement — "The Subtle Life Mascot"

**Date:** 2026-03-23
**Status:** Draft
**Topic:** Visual and behavioral refinement of the `Chameleon` mascot in `devdrivr cockpit`.

---

## 1. Objective
Refine the `Chameleon` mascot to improve its visual fidelity (shading and anatomy) and add subtle "life" animations (blinking and breathing) to enhance the app's personality without being distracting.

---

## 2. Visual Fidelity (The Sprite)

### 2.1 Anatomy & Shape
The 20x18 pixel art grid will be updated to:
- **Tail:** A more pronounced, curved "flicked" shape at the back of the sprite.
- **Head:** A more alert head position with a "focused" eye (pixel `[4, 4]`).
- **Branch:** Sitting on a more detailed 4-shade brown branch at the bottom of the grid.

### 2.2 Shading Ramp
The palette will be expanded to a 4-step shading ramp for both greens and browns:
- **Greens (Skin):** Highlight, Base, Shadow, Outline.
- **Browns (Branch):** Highlight, Base, Shadow, Outline.

---

## 3. Personality (Animations)

### 3.1 Periodic Blink
- **Effect:** The eye pixel (color `8` or `1`) will toggle to the skin color (color `4` or `5`) and back.
- **Timing:** A quick 200ms blink repeating every 3–5 seconds (randomized for a more natural feel).
- **Implementation:** CSS Keyframes or a simple React `setInterval`.

### 3.2 Breathing / Tail-Flick
- **Effect:** A subtle 1px vertical translation (breathing) or a back-and-forth pixel shift in the tail area.
- **Timing:** A slow, 10-second cycle.
- **Implementation:** CSS `transform: translateY()` or `transition: opacity` on specific pixel groups.

---

## 4. Interaction Patterns
- **Passive Mascot:** The mascot remains a passive companion in the `Sidebar.tsx`.
- **Responsive Colors:** Ensure the mascot's colors pop against both light and dark theme backgrounds (using current palette or CSS variables).

---

## 5. Implementation Notes
- Update `apps/cockpit/src/components/shared/Chameleon.tsx`.
- Utilize CSS `keyframes` for animations to minimize React re-renders.
- Maintain the pre-computed `RECTS` list pattern for performance.
- Ensure the `viewBox="0 0 20 18"` and `shapeRendering="crispEdges"` remain consistent.
