// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type MermaidTemplate = {
  id: string
  /** What the picker shows — `classDiagram` and `er` told the user nothing. */
  label: string
  content: string
}

export const TEMPLATES: MermaidTemplate[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    content: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B`,
  },
  {
    id: 'sequence',
    label: 'Sequence diagram',
    content: `sequenceDiagram
    Alice->>+Bob: Hello Bob
    Bob-->>-Alice: Hi Alice
    Alice->>+Bob: How are you?
    Bob-->>-Alice: Fine, thanks!`,
  },
  {
    id: 'classDiagram',
    label: 'Class diagram',
    content: `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal: +int age
    Animal: +String gender
    Animal: +isMammal()
    Duck: +String beakColor
    Duck: +swim()
    Fish: +int sizeInFeet
    Fish: +canEat()`,
  },
  {
    id: 'er',
    label: 'Entity relationship',
    content: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  },
  {
    id: 'gantt',
    label: 'Gantt chart',
    content: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: a1, 2024-01-01, 30d
    Task 2: a2, after a1, 20d
    section Phase 2
    Task 3: b1, after a2, 25d`,
  },
  {
    id: 'state',
    label: 'State diagram',
    content: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Submit
    Processing --> Success: Valid
    Processing --> Error: Invalid
    Error --> Idle: Reset
    Success --> [*]`,
  },
  {
    id: 'pie',
    label: 'Pie chart',
    content: `pie title Favorite Languages
    "TypeScript" : 40
    "Rust" : 25
    "Python" : 20
    "Go" : 15`,
  },
]

export function templateById(id: string): MermaidTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id)
}

// ---------------------------------------------------------------------------
// Source inspection
// ---------------------------------------------------------------------------

const DIAGRAM_LABELS: { match: RegExp; label: string }[] = [
  { match: /^(flowchart|graph)\b/, label: 'Flowchart' },
  { match: /^sequenceDiagram\b/, label: 'Sequence diagram' },
  { match: /^classDiagram(-v2)?\b/, label: 'Class diagram' },
  { match: /^stateDiagram(-v2)?\b/, label: 'State diagram' },
  { match: /^erDiagram\b/, label: 'Entity relationship' },
  { match: /^journey\b/, label: 'User journey' },
  { match: /^gantt\b/, label: 'Gantt chart' },
  { match: /^pie\b/, label: 'Pie chart' },
  { match: /^quadrantChart\b/, label: 'Quadrant chart' },
  { match: /^requirementDiagram\b/, label: 'Requirement diagram' },
  { match: /^gitGraph\b/, label: 'Git graph' },
  { match: /^mindmap\b/, label: 'Mindmap' },
  { match: /^timeline\b/, label: 'Timeline' },
  { match: /^sankey-beta\b/, label: 'Sankey diagram' },
  { match: /^xychart-beta\b/, label: 'XY chart' },
  { match: /^block-beta\b/, label: 'Block diagram' },
  { match: /^C4Context\b/, label: 'C4 context' },
]

/** A `%%{init}%%` directive or a `%%` comment is not the diagram keyword. */
function isDeclaration(line: string): boolean {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('%%')
}

/**
 * The diagram's own name, for the status line.
 *
 * Read off the first real line rather than from the template that was loaded:
 * the user is free to edit a flowchart into a sequence diagram.
 */
export function detectDiagramType(source: string): string | null {
  const first = source.split('\n').find(isDeclaration)
  if (!first) return null
  const trimmed = first.trim()
  return DIAGRAM_LABELS.find((entry) => entry.match.test(trimmed))?.label ?? 'Diagram'
}

/** Lines that actually say something — blank lines and `%%` comments do not. */
export function countStatements(source: string): number {
  return source.split('\n').filter(isDeclaration).length
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type MermaidError = {
  /** 1-based line in the source, when Mermaid names one. */
  line: number | null
  message: string
}

/**
 * Pulls the line number out of a Mermaid parse failure.
 *
 * Mermaid reports `Parse error on line 3:` and then repeats the offending text
 * over several lines with a `^` marker. Showing that raw blob told the user
 * nothing they could click; the line goes to a "Go to error" button and the
 * first sentence is what the banner shows.
 */
export function parseMermaidError(error: unknown): MermaidError {
  const raw = error instanceof Error ? error.message : String(error)
  const match = /(?:parse|lexical|syntax) error on line (\d+)/i.exec(raw)
  const line = match?.[1] ? Number(match[1]) : null
  // Everything after the first blank line is the quoted source and the caret
  // marker, which is noise once the caret can be put on the line itself.
  const firstBlock = raw.split(/\n\s*\n/)[0] ?? raw
  const headline = firstBlock.split('\n')[0]?.trim() || 'Mermaid could not render this diagram'
  // `Parse error on line 3:` on its own says nothing actionable — the part worth
  // reading is the `Expecting …` line Mermaid prints after the caret marker.
  const expecting = /^\s*(Expecting .*)$/m.exec(raw)?.[1]?.trim()
  const message = expecting ? `${headline.replace(/:$/, '')} — ${expecting}` : headline
  return { line: line !== null && Number.isFinite(line) && line > 0 ? line : null, message }
}

/**
 * Translates a line number Mermaid reported back to a line in the user's source.
 *
 * Mermaid parses a preprocessed copy of the text: front matter, `%%{…}%%`
 * directives, `%%` comments and leading blank lines are all stripped first
 * (`cleanupComments` + `processFrontmatter` in mermaid 10). Without this,
 * "Go to line" and the editor's error marker land on the wrong line for any
 * diagram that carries a comment header.
 */
export function sourceLineForReportedLine(source: string, reported: number): number {
  const lines = source.split('\n')
  const kept: number[] = []
  let inFrontMatter = false
  let seenContent = false

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (index === 0 && trimmed === '---') {
      inFrontMatter = true
      return
    }
    if (inFrontMatter) {
      if (trimmed === '---') inFrontMatter = false
      return
    }
    if (trimmed.startsWith('%%')) return
    // `trimStart()` removes the blank lines before the first statement, but not
    // blank lines further down.
    if (!seenContent && trimmed === '') return
    seenContent = true
    kept.push(index + 1)
  })

  return kept[reported - 1] ?? Math.min(reported, Math.max(lines.length, 1))
}

/** Re-points a Mermaid error at the matching line of the untouched source. */
export function withSourceLine(error: MermaidError, source: string): MermaidError {
  if (!error.line) return error
  const line = sourceLineForReportedLine(source, error.line)
  if (line === error.line) return error
  // The message quotes the line number too; leaving the old one there would
  // contradict the "Go to line" button standing next to it.
  return { line, message: error.message.replace(/\bline \d+/i, `line ${line}`) }
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

export type SvgSize = { width: number; height: number }

const FALLBACK_SIZE: SvgSize = { width: 800, height: 600 }

function parseLength(value: string | null | undefined): number | null {
  if (!value) return null
  const number = Number.parseFloat(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * The diagram's real pixel size.
 *
 * `img.width` was used before, but Mermaid emits `style="max-width: …"` with no
 * pixel width, so the browser fell back to 300×150 and every PNG export came
 * out cropped. The `viewBox` is the authoritative size.
 */
export function svgSize(svg: string): SvgSize {
  const viewBox = /viewBox="([^"]+)"/i.exec(svg)?.[1]
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    const width = parts[2]
    const height = parts[3]
    if (
      width !== undefined &&
      height !== undefined &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { width, height }
    }
  }
  const width = parseLength(/\bwidth="([\d.]+)/i.exec(svg)?.[1])
  const height = parseLength(/\bheight="([\d.]+)/i.exec(svg)?.[1])
  if (width && height) return { width, height }
  return FALLBACK_SIZE
}

/**
 * Pins explicit pixel dimensions on the root `<svg>`.
 *
 * Without this an exported or copied SVG carries Mermaid's `max-width` style
 * and renders at the wrong size — or not at all — once it is out of the app.
 */
export function svgWithExplicitSize(svg: string, size: SvgSize): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const cleaned = attributes
      .replace(/\s(width|height)="[^"]*"/gi, '')
      .replace(/style="[^"]*"/gi, (style: string) => style.replace(/max-width:[^;"]*;?/gi, ''))
    return `<svg${cleaned} width="${size.width}" height="${size.height}">`
  })
}

/** The zoom that makes the whole diagram fit, never enlarging past 1×. */
export function fitScale(content: SvgSize, viewport: SvgSize, padding = 32): number {
  const availableWidth = Math.max(viewport.width - padding, 1)
  const availableHeight = Math.max(viewport.height - padding, 1)
  const scale = Math.min(availableWidth / content.width, availableHeight / content.height)
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(scale, 1)
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** `diagram.mmd` → `diagram.svg`; an export never proposes the source's name. */
export function exportFileName(source: string | null, extension: string): string {
  const base = (source ?? 'diagram').replace(/\.[^./\\]+$/, '')
  return `${base}.${extension}`
}
