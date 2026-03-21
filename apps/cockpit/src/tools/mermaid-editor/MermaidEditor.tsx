import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, EDITOR_OPTIONS } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'
import { useUiStore } from '@/stores/ui.store'

type MermaidEditorState = {
  content: string
}

const TEMPLATES: Record<string, string> = {
  flowchart: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B`,
  sequence: `sequenceDiagram
    Alice->>+Bob: Hello Bob
    Bob-->>-Alice: Hi Alice
    Alice->>+Bob: How are you?
    Bob-->>-Alice: Fine, thanks!`,
  classDiagram: `classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal: +int age
    Animal: +String gender
    Animal: +isMammal()
    Duck: +String beakColor
    Duck: +swim()
    Fish: +int sizeInFeet
    Fish: +canEat()`,
  er: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses`,
  gantt: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
    Task 1: a1, 2024-01-01, 30d
    Task 2: a2, after a1, 20d
    section Phase 2
    Task 3: b1, after a2, 25d`,
  state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Submit
    Processing --> Success: Valid
    Processing --> Error: Invalid
    Error --> Idle: Reset
    Success --> [*]`,
  pie: `pie title Favorite Languages
    "TypeScript" : 40
    "Rust" : 25
    "Python" : 20
    "Go" : 15`,
}

export default function MermaidEditor() {
  useMonacoTheme()
  const [state, updateState] = useToolState<MermaidEditorState>('mermaid-editor', {
    content: TEMPLATES['flowchart'] ?? '',
  })

  const setLastAction = useUiStore((s) => s.setLastAction)
  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Render mermaid diagram (debounced 500ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!state.content.trim()) {
        setSvgHtml('')
        setError(null)
        return
      }
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, theme: 'dark' })
        const { svg } = await mermaid.render('mermaid-preview', state.content)
        setSvgHtml(svg)
        setError(null)
      } catch (e) {
        setError((e as Error).message)
        setSvgHtml('')
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.content])

  const handleExportSvg = useCallback(() => {
    if (!svgHtml) return
    navigator.clipboard.writeText(svgHtml)
    setLastAction('SVG copied to clipboard', 'success')
  }, [svgHtml, setLastAction])

  const handleExportPng = useCallback(async () => {
    if (!svgHtml || !previewRef.current) return
    // Convert SVG to PNG via canvas
    const svgBlob = new Blob([svgHtml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (!blob) return
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setLastAction('PNG copied to clipboard', 'success')
      })
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [svgHtml, setLastAction])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-pixel text-xs text-[var(--color-text-muted)]">Templates:</span>
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            onClick={() => updateState({ content: TEMPLATES[name] ?? '' })}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-[var(--color-border)]" />
        <button
          onClick={handleExportSvg}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          disabled={!svgHtml}
        >
          Copy SVG
        </button>
        <button
          onClick={handleExportPng}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          disabled={!svgHtml}
        >
          Copy PNG
        </button>
        <div className="ml-auto">
          <CopyButton text={state.content} label="Copy Source" />
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-error)]">
          {error}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-[var(--color-border)]">
          <Editor
            value={state.content}
            onChange={(v) => updateState({ content: v ?? '' })}
            options={EDITOR_OPTIONS}
          />
        </div>
        <div
          ref={previewRef}
          className="flex w-1/2 items-center justify-center overflow-auto bg-[var(--color-surface)] p-4"
        >
          {svgHtml ? (
            <div dangerouslySetInnerHTML={{ __html: svgHtml }} />
          ) : (
            <div className="text-sm text-[var(--color-text-muted)]">
              {error ? 'Fix syntax errors to see preview' : 'Enter mermaid syntax...'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
