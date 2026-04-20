import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonacoTheme, useMonacoOptions } from '@/hooks/useMonaco'
import { CopyButton } from '@/components/shared/CopyButton'

type CssToTailwindState = {
  input: string
}

type ConversionResult = {
  classes: string[]
  unconvertible: string[]
}

// Core property → Tailwind class mapping
const PROPERTY_MAP: Record<string, Record<string, string>> = {
  display: {
    flex: 'flex',
    grid: 'grid',
    block: 'block',
    'inline-block': 'inline-block',
    inline: 'inline',
    none: 'hidden',
    'inline-flex': 'inline-flex',
  },
  position: {
    relative: 'relative',
    absolute: 'absolute',
    fixed: 'fixed',
    sticky: 'sticky',
    static: 'static',
  },
  'text-align': {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
    justify: 'text-justify',
  },
  'font-weight': {
    100: 'font-thin',
    200: 'font-extralight',
    300: 'font-light',
    400: 'font-normal',
    500: 'font-medium',
    600: 'font-semibold',
    700: 'font-bold',
    800: 'font-extrabold',
    900: 'font-black',
    bold: 'font-bold',
    normal: 'font-normal',
  },
  'font-style': { italic: 'italic', normal: 'not-italic' },
  'text-decoration': {
    underline: 'underline',
    'line-through': 'line-through',
    none: 'no-underline',
  },
  overflow: {
    hidden: 'overflow-hidden',
    auto: 'overflow-auto',
    scroll: 'overflow-scroll',
    visible: 'overflow-visible',
  },
  'overflow-x': {
    hidden: 'overflow-x-hidden',
    auto: 'overflow-x-auto',
    scroll: 'overflow-x-scroll',
  },
  'overflow-y': {
    hidden: 'overflow-y-hidden',
    auto: 'overflow-y-auto',
    scroll: 'overflow-y-scroll',
  },
  'flex-direction': {
    row: 'flex-row',
    column: 'flex-col',
    'row-reverse': 'flex-row-reverse',
    'column-reverse': 'flex-col-reverse',
  },
  'flex-wrap': { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' },
  'justify-content': {
    center: 'justify-center',
    'flex-start': 'justify-start',
    'flex-end': 'justify-end',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'space-evenly': 'justify-evenly',
  },
  'align-items': {
    center: 'items-center',
    'flex-start': 'items-start',
    'flex-end': 'items-end',
    stretch: 'items-stretch',
    baseline: 'items-baseline',
  },
  cursor: {
    pointer: 'cursor-pointer',
    default: 'cursor-default',
    'not-allowed': 'cursor-not-allowed',
    wait: 'cursor-wait',
    text: 'cursor-text',
  },
  'white-space': {
    nowrap: 'whitespace-nowrap',
    pre: 'whitespace-pre',
    'pre-wrap': 'whitespace-pre-wrap',
    normal: 'whitespace-normal',
  },
  'word-break': { 'break-all': 'break-all', 'keep-all': 'break-keep' },
  'pointer-events': { none: 'pointer-events-none', auto: 'pointer-events-auto' },
  'user-select': {
    none: 'select-none',
    all: 'select-all',
    auto: 'select-auto',
    text: 'select-text',
  },
  'box-sizing': { 'border-box': 'box-border', 'content-box': 'box-content' },
  visibility: { hidden: 'invisible', visible: 'visible' },
  'list-style-type': { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' },
  'text-transform': {
    uppercase: 'uppercase',
    lowercase: 'lowercase',
    capitalize: 'capitalize',
    none: 'normal-case',
  },
  'text-overflow': { ellipsis: 'truncate', clip: 'overflow-hidden' },
  'vertical-align': {
    top: 'align-top',
    middle: 'align-middle',
    bottom: 'align-bottom',
    baseline: 'align-baseline',
    'text-top': 'align-text-top',
    'text-bottom': 'align-text-bottom',
  },
  'object-fit': {
    contain: 'object-contain',
    cover: 'object-cover',
    fill: 'object-fill',
    none: 'object-none',
    'scale-down': 'object-scale-down',
  },
  float: { left: 'float-left', right: 'float-right', none: 'float-none' },
  clear: { left: 'clear-left', right: 'clear-right', both: 'clear-both', none: 'clear-none' },
  'border-style': {
    solid: 'border-solid',
    dashed: 'border-dashed',
    dotted: 'border-dotted',
    double: 'border-double',
    none: 'border-none',
    hidden: 'border-hidden',
  },
  resize: { none: 'resize-none', both: 'resize', horizontal: 'resize-x', vertical: 'resize-y' },
  appearance: { none: 'appearance-none', auto: 'appearance-auto' },
  'align-self': {
    auto: 'self-auto',
    'flex-start': 'self-start',
    'flex-end': 'self-end',
    center: 'self-center',
    stretch: 'self-stretch',
    baseline: 'self-baseline',
  },
  'align-content': {
    center: 'content-center',
    'flex-start': 'content-start',
    'flex-end': 'content-end',
    'space-between': 'content-between',
    'space-around': 'content-around',
    'space-evenly': 'content-evenly',
    stretch: 'content-stretch',
  },
  'place-items': {
    center: 'place-items-center',
    start: 'place-items-start',
    end: 'place-items-end',
    stretch: 'place-items-stretch',
  },
  'flex-grow': { '0': 'grow-0', '1': 'grow' },
  'flex-shrink': { '0': 'shrink-0', '1': 'shrink' },
}

// Size-based properties with arbitrary value support
function convertSizeProperty(prop: string, value: string): string | null {
  const prefix: Record<string, string> = {
    width: 'w',
    'min-width': 'min-w',
    'max-width': 'max-w',
    height: 'h',
    'min-height': 'min-h',
    'max-height': 'max-h',
    gap: 'gap',
    'row-gap': 'gap-y',
    'column-gap': 'gap-x',
    top: 'top',
    right: 'right',
    bottom: 'bottom',
    left: 'left',
    'font-size': 'text',
    'line-height': 'leading',
    'border-radius': 'rounded',
    'z-index': 'z',
    opacity: 'opacity',
  }
  const p = prefix[prop]
  if (!p) return null

  if (value === '100%') return `${p}-full`
  if (value === '100vw') return `${p}-screen`
  if (value === '100vh') return `${p}-screen`
  if (value === 'auto') return `${p}-auto`
  if (value === '0' || value === '0px') return `${p}-0`
  if (value === 'fit-content') return `${p}-fit`
  if (value === 'min-content') return `${p}-min`
  if (value === 'max-content') return `${p}-max`

  return `${p}-[${value}]`
}

function convertSpacingProperty(prop: string, value: string): string | null {
  const prefix: Record<string, string> = {
    margin: 'm',
    'margin-top': 'mt',
    'margin-right': 'mr',
    'margin-bottom': 'mb',
    'margin-left': 'ml',
    'margin-inline': 'mx',
    'margin-block': 'my',
    padding: 'p',
    'padding-top': 'pt',
    'padding-right': 'pr',
    'padding-bottom': 'pb',
    'padding-left': 'pl',
    'padding-inline': 'px',
    'padding-block': 'py',
  }
  const p = prefix[prop]
  if (!p) return null
  if (value === '0' || value === '0px') return `${p}-0`
  if (value === 'auto') return `${p}-auto`
  return `${p}-[${value}]`
}

function convertCssToTailwind(css: string): ConversionResult {
  const classes: string[] = []
  const unconvertible: string[] = []

  // Extract declarations from CSS (strip selectors and braces)
  const declarations = css
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
    .replace(/[^{]*\{/g, '') // strip selectors
    .replace(/\}/g, '') // strip closing braces
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx < 0) continue
    const prop = decl.slice(0, colonIdx).trim()
    const value = decl.slice(colonIdx + 1).trim()

    // Check direct mapping
    const directMap = PROPERTY_MAP[prop]
    if (directMap) {
      const cls = directMap[value]
      if (cls) {
        classes.push(cls)
        continue
      }
    }

    // Check size properties
    const sizeClass = convertSizeProperty(prop, value)
    if (sizeClass) {
      classes.push(sizeClass)
      continue
    }

    // Check spacing properties
    const spacingClass = convertSpacingProperty(prop, value)
    if (spacingClass) {
      classes.push(spacingClass)
      continue
    }

    // Color properties
    if (prop === 'color') {
      classes.push(`text-[${value}]`)
      continue
    }
    if (prop === 'background-color' || prop === 'background') {
      classes.push(`bg-[${value}]`)
      continue
    }
    if (prop === 'border-color') {
      classes.push(`border-[${value}]`)
      continue
    }

    // Border width
    if (prop === 'border-width' || prop === 'border') {
      if (value === '0' || value === 'none') {
        classes.push('border-0')
        continue
      }
      classes.push(`border-[${value}]`)
      continue
    }

    // Couldn't convert
    unconvertible.push(`${prop}: ${value}`)
  }

  return { classes, unconvertible }
}

export default function CssToTailwind() {
  const monacoTheme = useMonacoTheme()
  const monacoOptions = useMonacoOptions()
  const [state, updateState] = useToolState<CssToTailwindState>('css-to-tailwind', {
    input: '',
  })
  const result = useMemo(() => {
    if (!state.input.trim()) return null
    return convertCssToTailwind(state.input)
  }, [state.input])

  const classString = result?.classes.join(' ') ?? ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-h-0 w-1/2 flex-col overflow-hidden border-r border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-text-muted)]">
            CSS Input
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <Editor
              theme={monacoTheme}
              language="css"
              value={state.input}
              onChange={(v) => updateState({ input: v ?? '' })}
              options={monacoOptions}
            />
          </div>
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">Tailwind Output</span>
            {classString && <CopyButton text={classString} />}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {result ? (
              <div className="flex flex-col gap-4">
                {result.classes.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-mono text-xs text-[var(--color-success)]">
                      Converted Classes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {result.classes.map((cls, i) => (
                        <code
                          key={i}
                          className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs text-[var(--color-accent)]"
                        >
                          {cls}
                        </code>
                      ))}
                    </div>
                    <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="mb-1 text-xs text-[var(--color-text-muted)]">
                        Full class string:
                      </div>
                      <code className="text-xs text-[var(--color-text)]">{classString}</code>
                    </div>
                  </section>
                )}
                {result.unconvertible.length > 0 && (
                  <section>
                    <h3 className="mb-2 font-mono text-xs text-[var(--color-warning)]">
                      Unconvertible
                    </h3>
                    {result.unconvertible.map((prop, i) => (
                      <div key={i} className="text-xs text-[var(--color-text-muted)]">
                        {prop}
                      </div>
                    ))}
                  </section>
                )}
              </div>
            ) : (
              <div className="text-sm text-[var(--color-text-muted)]">
                Enter CSS on the left to convert
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
