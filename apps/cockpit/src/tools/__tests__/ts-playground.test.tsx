import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import TsPlayground from '../ts-playground/TsPlayground'

describe('TsPlayground', () => {
  it('renders both editors', () => {
    renderTool(TsPlayground)
    const editors = screen.getAllByTestId('monaco-editor')
    expect(editors.length).toBeGreaterThanOrEqual(2)
  })

  it('renders target and module selects', () => {
    renderTool(TsPlayground)
    const selects = screen.getAllByDisplayValue('ESNext')
    expect(selects).toHaveLength(2)
  })

  it('renders strict checkbox', () => {
    renderTool(TsPlayground)
    expect(screen.getByText('Strict')).toBeInTheDocument()
  })

  it('renders copy output button', () => {
    renderTool(TsPlayground)
    expect(screen.getByText('Copy Output')).toBeInTheDocument()
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // Transpilation is auto-triggered (debounced 500ms) via the real TypeScript
  // compiler in the worker mock. A no-op worker mock never resolves transpile()
  // and the output editor would stay empty forever.

  it('transpiles TS input to JS output via the real typescript worker', async () => {
    renderTool(TsPlayground)
    const [input, output] = screen.getAllByTestId('monaco-editor')

    fireEvent.change(input!, {
      target: { value: 'const greet = (n: string): string => `hi ${n}`' },
    })

    await waitFor(
      () => {
        expect(output).toHaveValue('"use strict";\nconst greet = (n) => `hi ${n}`;\n')
      },
      { timeout: 3000 }
    )
  })

  it('reports a real diagnostic for invalid TypeScript', async () => {
    renderTool(TsPlayground)
    const [input] = screen.getAllByTestId('monaco-editor')

    fireEvent.change(input!, { target: { value: 'const x: number = "not a number"' } })

    await waitFor(
      () => {
        expect(screen.getByText(/not assignable/i)).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
  })
})
