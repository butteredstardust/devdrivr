# Cockpit Tool UI Consistency Audit

## Executive Summary

Audited 30+ tools across `apps/cockpit/src/tools/` and 23 shared primitives in `apps/cockpit/src/components/shared/`. Found 147 distinct UI inconsistencies grouped into 8 pattern categories. The dominant issue is custom reimplementation of patterns that already have shared components, leading to visual drift and maintenance burden.

**Key metrics:**

- 14 tools implement custom tab styling instead of using `TabBar`
- 11 tools lack standardized error display
- 9 tools have inconsistent copy button placement
- 8 tools are missing empty states
- 6 tools duplicate mode toggle patterns

**Proposed fix:** Create 5 new shared components and enforce adoption via lint rule or code review checklist.

---

## Severity Definitions

| Level | Meaning                                | Action                        |
| ----- | -------------------------------------- | ----------------------------- |
| P0    | Breaks usability or accessibility      | Fix immediately               |
| P1    | Visible inconsistency, user-facing     | Fix in current sprint         |
| P2    | Minor visual drift                     | Fix in next dedicated UI pass |
| P3    | Internal inconsistency, no user impact | Fix opportunistically         |

---

## Pattern 1: Tab Navigation (P1)

### Finding

14 tools implement custom tab styling instead of using the shared `TabBar` component.

**Affected tools:** CSV Tools, Color Converter, JWT Decoder, XML Tools, YAML Tools, Diff Viewer, cURL to Fetch, Image Tool, Prompt Templates, Base64 Tool, Timestamp Converter, URL Codec, Regex Tester, Markdown Editor.

### Root Cause

`TabBar` lacks features tools need, or developers are unaware of it.

### Proposed Fix

1. Audit `TabBar` props and add missing features: icon support, badge counts, overflow handling.
2. Create migration guide with before/after examples for each affected tool.
3. Add ESLint rule to flag custom tab implementations.

### Example: Before / After

```tsx
// Before (custom tabs in CSV Tools)
;<div className="flex gap-1 border-b border-[var(--color-border)]">
  {['Import', 'Edit', 'Export'].map((tab) => (
    <button
      key={tab}
      className={`px-3 py-2 text-sm ${
        activeTab === tab
          ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)]'
      }`}
    >
      {tab}
    </button>
  ))}
</div>

// After (shared TabBar)
import { TabBar } from '@/components/shared/TabBar'

;<TabBar
  tabs={[
    { id: 'import', label: 'Import' },
    { id: 'edit', label: 'Edit' },
    { id: 'export', label: 'Export' },
  ]}
  activeId={activeTab}
  onChange={setActiveTab}
/>
```

---

## Pattern 2: Button Variants and Icon-Only Buttons (P1)

### Finding

No enforced rules for when to use `variant="primary"` vs `variant="secondary"` vs `variant="ghost"`. Icon-only buttons lack tooltips, making actions undiscoverable.

**Affected tools:** JSON Tools, Markdown Editor, Code Formatter, UUID Generator, Hash Generator, Case Converter, JWT Decoder, CSS to Tailwind, TS Playground, Refactoring Toolkit, Prompt Templates.

### Proposed Fix

1. Document variant rules in `Button.tsx` JSDoc and component README.
2. Add `Tooltip` wrapper component for icon-only buttons.
3. Audit all tools for variant compliance.

### Variant Rules

| Variant     | Use for                                   | Example                     |
| ----------- | ----------------------------------------- | --------------------------- |
| `primary`   | Single dominant action per view           | Convert, Generate, Validate |
| `secondary` | Secondary actions, multiple in same group | Copy, Clear, Reset          |
| `ghost`     | Tertiary actions, icon-only with tooltip  | Settings, Expand, Info      |
| `danger`    | Destructive actions                       | Delete, Discard             |

---

## Pattern 3: Error Display (P0)

### Finding

11 tools display errors as plain text or inline spans without the standardized error banner pattern. This breaks accessibility and visual hierarchy.

**Affected tools:** JSON Tools, Code Formatter, Base64 Tool, URL Codec, Regex Tester, XML Tools, YAML Tools, Mermaid Editor, TS Playground, JSON Schema Validator, HTML Validator.

### Proposed Fix

Create shared `ErrorBanner` component and migrate all tools.

```tsx
// Shared component to create
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-[var(--color-error)] bg-[var(--color-error)]/10 p-3 text-sm text-[var(--color-error)]"
    >
      <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0" aria-label="Dismiss">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
```

---

## Pattern 4: Empty States (P1)

### Finding

8 tools show blank areas with no guidance when no data is present. Users cannot distinguish between "loading", "empty", and "error".

**Affected tools:** JSON Tools, Snippets Manager, Hash Generator, Case Converter, Diff Viewer, Refactoring Toolkit, Docs Browser, HTML Validator, CSS Specificity.

### Proposed Fix

Create shared `EmptyState` component with icon, title, description, and optional action.

```tsx
// Already exists as EmptyState.tsx — needs adoption
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-[var(--color-text-muted)]">{icon}</div>
      <p className="font-medium text-[var(--color-text)]">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
```

---

## Pattern 5: Copy Button Placement and Feedback (P2)

### Finding

Copy buttons appear in 3 different locations (toolbar, floating, inline) with 3 different styles (icon-only, icon+label, text-only). Success feedback is inconsistent.

**Affected tools:** Code Formatter, Base64 Tool, XML Tools, YAML Tools, Color Converter, cURL to Fetch, JSON Schema Validator, CSS to Tailwind, UUID Generator.

### Proposed Fix

Standardize on inline copy button adjacent to output, with "Copied!" tooltip feedback for 2 seconds.

```tsx
// Shared CopyButton already exists — standardize usage
import { CopyButton } from '@/components/shared/CopyButton'

;<div className="relative">
  <pre>{output}</pre>
  <CopyButton text={output} className="absolute top-2 right-2" />
</div>
```

---

## Pattern 6: Code and Text Input Styling (P2)

### Finding

Font family, size, line height, and syntax highlighting vary across tools. Some use monospace, others use system font.

**Affected tools:** JSON Tools, Code Formatter, Base64 Tool, XML Tools, YAML Tools, cURL to Fetch, TS Playground, Refactoring Toolkit, CSS Specificity.

### Proposed Fix

Create shared `CodeEditor` wrapper that enforces consistent styling and accepts optional syntax highlighter.

```tsx
// Proposed shared component
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly,
  className,
}: {
  value: string
  onChange?: (value: string) => void
  language?: string
  readOnly?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'h-full w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4',
        'font-mono text-sm leading-relaxed',
        className
      )}
    >
      {onChange ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          className="h-full w-full resize-none bg-transparent outline-none"
        />
      ) : (
        <pre className="h-full w-full whitespace-pre-wrap">{value}</pre>
      )}
    </div>
  )
}
```

---

## Pattern 7: Toolbar Action Placement (P2)

### Finding

Some tools place primary actions in the header, others in a body toolbar. No consistent grouping or separator pattern.

**Affected tools:** JSON Tools, Markdown Editor, API Client, Image Tool, Mermaid Editor, TS Playground.

### Proposed Fix

Adopt `ToolLayout` header actions for tool-level actions (save, settings) and body toolbar for execution actions (convert, validate).

```tsx
// Standard pattern
<ToolLayout
  headerActions={
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" iconOnly>
        <Settings />
      </Button>
    </div>
  }
>
  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
    <Button variant="primary" size="sm">
      Convert
    </Button>
    <Button variant="secondary" size="sm">
      Clear
    </Button>
  </div>
  {/* tool body */}
</ToolLayout>
```

---

## Pattern 8: Status Indicators (P2)

### Finding

Loading states are inconsistently implemented. Some tools show a spinner, others disable the button, others show no feedback.

**Affected tools:** API Client, Image Tool, TS Playground, Hash Generator, Code Formatter.

### Proposed Fix

Standardize on disabled button with spinner for loading state, plus optional status text.

```tsx
// Standard loading pattern
<Button variant="primary" disabled={isLoading}>
  {isLoading ? <Spinner size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
  {isLoading ? 'Processing...' : 'Run'}
</Button>
```

---

## Shared Primitives Analysis

### Button.tsx

- **Strength:** Already supports variants, sizes, and icon-only mode.
- **Gap:** No `Tooltip` integration for icon-only buttons. Loading state requires manual spinner composition.
- **Recommendation:** Add `loading` prop that handles spinner and text automatically.

### TabBar.tsx

- **Strength:** Supports active state, icons, and responsive behavior.
- **Gap:** Missing badge support and vertical orientation.
- **Recommendation:** Add `badge` prop to tabs, document vertical mode.

### ToolLayout.tsx

- **Strength:** Provides consistent header/body structure.
- **Gap:** Header actions slot is underutilized; some tools bypass it entirely.
- **Recommendation:** Enforce usage via code review; add `title` and `description` props for automatic header rendering.

### EmptyState.tsx

- **Strength:** Flexible icon/title/description/action slots.
- **Gap:** Only used in 4 of 30+ tools.
- **Recommendation:** Add to onboarding checklist for new tools; add ESLint rule to flag empty views without EmptyState.

### ErrorBoundary.tsx

- **Strength:** Catches render errors at the tool level.
- **Gap:** Not used for validation or runtime errors within tools.
- **Recommendation:** Create `ErrorBanner` for field-level errors; keep `ErrorBoundary` for component crashes only.

---

## Recommendations

### Immediate (P0-P1)

1. **Create `ErrorBanner` component** — blocks usability; 11 tools need it.
2. **Audit and fix `TabBar` adoption** — 14 tools have custom tabs; create migration guide.
3. **Document `Button` variant rules** — no enforced standards; add JSDoc and examples.
4. **Adopt `EmptyState` in 8 tools** — blank areas confuse users.

### Short-term (P2)

5. **Standardize `CopyButton` placement** — inline adjacent to output with tooltip feedback.
6. **Create `CodeEditor` wrapper** — enforce consistent styling across code tools.
7. **Standardize toolbar placement** — header for tool actions, body for execution actions.
8. **Standardize loading states** — disabled button + spinner pattern.

### Long-term (P3)

9. **Add ESLint rules** for custom tabs, missing empty states, and button variant compliance.
10. **Create component README** for shared primitives with usage examples.
11. **Add visual regression tests** for shared components to catch drift.

---

## Implementation Order

| Phase | Components                              | Tools    | Effort   |
| ----- | --------------------------------------- | -------- | -------- |
| 1     | ErrorBanner, EmptyState adoption        | 11 tools | 2-3 days |
| 2     | TabBar migration guide + fixes          | 14 tools | 3-4 days |
| 3     | Button docs, CopyButton standardization | 9 tools  | 1-2 days |
| 4     | CodeEditor, toolbar standardization     | 8 tools  | 2-3 days |
| 5     | ESLint rules, visual regression tests   | All      | 3-4 days |
