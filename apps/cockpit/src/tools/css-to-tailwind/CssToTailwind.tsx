import { useMemo } from 'react'
import Editor from '@monaco-editor/react'
import { WindIcon } from '@phosphor-icons/react'
import { useToolState } from '@/hooks/useToolState'
import { useMonaco } from '@/hooks/useMonaco'
import { Button } from '@/components/shared/Button'
import { CopyButton } from '@/components/shared/CopyButton'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SplitPane } from '@/components/shared/SplitPane'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { TOOL_SAMPLES } from '@/lib/tool-samples'
import * as cssTree from 'css-tree'

type CssToTailwindState = {
  input: string
}

type ConversionResult = {
  classes: string[]
  unconvertible: string[]
}

function arbitraryValue(value: string): string {
  return value.replace(/\s+/g, '_')
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

  return `${p}-[${arbitraryValue(value)}]`
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
  return `${p}-[${arbitraryValue(value)}]`
}

function convertCssToTailwind(css: string): ConversionResult {
  const classes: string[] = []
  const unconvertible: string[] = []

  const declarations: Array<{
    prop: string
    rawValue: string
    important: boolean
    variants: string[]
  }> = []
  try {
    const ast = cssTree.parse(css, { positions: true })
    cssTree.walk(ast, {
      visit: 'Declaration',
      enter(node) {
        const variants: string[] = []
        const selector = this.rule?.prelude ? cssTree.generate(this.rule.prelude) : ''
        for (const match of selector.matchAll(
          /:(hover|focus|active|disabled|visited|checked)\b/g
        )) {
          const variant = match[1]
          if (variant && !variants.includes(variant)) variants.push(variant)
        }
        if (this.atrule?.name === 'media' && this.atrule.prelude) {
          const media = cssTree.generate(this.atrule.prelude)
          const width = Number(media.match(/min-width\s*:\s*(\d+)px/i)?.[1])
          const breakpoint =
            width >= 1536
              ? '2xl'
              : width >= 1280
                ? 'xl'
                : width >= 1024
                  ? 'lg'
                  : width >= 768
                    ? 'md'
                    : width >= 640
                      ? 'sm'
                      : null
          if (breakpoint) variants.unshift(breakpoint)
          else unconvertible.push(`@media ${media} (unsupported context)`)
        }
        const value = cssTree.generate(node.value)
        declarations.push({
          prop: node.property,
          rawValue: node.important ? `${value} !important` : value,
          important: node.important,
          variants,
        })
      },
    })
  } catch (error) {
    return {
      classes,
      unconvertible: [error instanceof Error ? error.message : 'Invalid CSS'],
    }
  }

  for (const declaration of declarations) {
    const { prop, rawValue, important, variants } = declaration

    // `!important` has to come off before anything else looks at the value. Left on, it defeats
    // every lookup in PROPERTY_MAP and every equality check in the size/spacing converters, and
    // then lands inside an arbitrary-value bracket — `color: red !important` produced
    // `text-[red !important]`, which is not a parseable class.
    const value = important ? rawValue.replace(/!\s*important$/i, '').trim() : rawValue

    // Tailwind v4 marks importance with a trailing `!` (`text-[red]!`). This is one of the
    // breaking changes from v3, which used a leading `!` — check the version before touching.
    const push = (cls: string) => {
      const contextual = `${variants.map((variant) => `${variant}:`).join('')}${cls}`
      classes.push(important ? `${contextual}!` : contextual)
    }

    // Check direct mapping
    const directMap = PROPERTY_MAP[prop]
    if (directMap) {
      const cls = directMap[value]
      if (cls) {
        push(cls)
        continue
      }
    }

    // Check size properties
    const sizeClass = convertSizeProperty(prop, value)
    if (sizeClass) {
      push(sizeClass)
      continue
    }

    // Check spacing properties
    const spacingClass = convertSpacingProperty(prop, value)
    if (spacingClass) {
      push(spacingClass)
      continue
    }

    // Color properties
    if (prop === 'color') {
      push(`text-[${arbitraryValue(value)}]`)
      continue
    }
    if (prop === 'background-color' || prop === 'background') {
      push(`bg-[${arbitraryValue(value)}]`)
      continue
    }
    if (prop === 'border-color') {
      push(`border-[${arbitraryValue(value)}]`)
      continue
    }

    // Border width
    if (prop === 'border-width' || prop === 'border') {
      if (value === '0' || value === 'none') {
        push('border-0')
        continue
      }
      push(`border-[${arbitraryValue(value)}]`)
      continue
    }

    // Couldn't convert
    // Report what the user wrote, `!important` included — echoing the stripped value back would
    // misrepresent their input in the one list they read to find out what went wrong.
    unconvertible.push(`${prop}: ${rawValue}`)
  }

  return { classes: [...new Set(classes)], unconvertible: [...new Set(unconvertible)] }
}

export default function CssToTailwind() {
  const { theme: monacoTheme, options: monacoOptions } = useMonaco()
  const [state, updateState] = useToolState<CssToTailwindState>('css-to-tailwind', {
    input: '',
  })
  const result = useMemo(() => {
    if (!state.input.trim()) return null
    return convertCssToTailwind(state.input)
  }, [state.input])

  const classString = result?.classes.join(' ') ?? ''

  return (
    <ToolLayout fullBleed>
      <SplitPane storageKey="css-to-tailwind" aria-label="Resize CSS input and Tailwind output">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PaneHeader title="CSS Input" />
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
        <div className="flex min-h-0 flex-1 flex-col">
          <PaneHeader
            title="Tailwind Output"
            actions={classString ? <CopyButton text={classString} /> : undefined}
          />
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
              <EmptyState
                icon={WindIcon}
                title="Enter CSS on the left to convert"
                description="Declarations map to Tailwind utilities; anything without an equivalent is listed separately."
                action={
                  TOOL_SAMPLES['css-to-tailwind'] ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateState({ input: TOOL_SAMPLES['css-to-tailwind'] ?? '' })}
                    >
                      Load sample
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      </SplitPane>
    </ToolLayout>
  )
}
