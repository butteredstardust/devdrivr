import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from './test-utils'
import TsPlayground, { describeProblems } from '../ts-playground/TsPlayground'
import { transpile } from '@/workers/typescript.api'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import { TOOLS } from '@/app/tool-registry'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

const WAIT = { timeout: 5000 }

function editors() {
  return screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
}

function typeCode(value: string) {
  const [input] = editors()
  fireEvent.change(input!, { target: { value } })
}

function problems() {
  return within(screen.getByRole('region', { name: 'Problems' }))
}

beforeEach(() => {
  vi.mocked(saveFileDialog).mockReset().mockResolvedValue('/tmp/output.js')
  useUiStore.setState({ lastAction: null })
})

describe('TsPlayground', () => {
  it('labels both panes instead of leaving two anonymous editors', () => {
    renderTool(TsPlayground)
    expect(screen.getByRole('region', { name: 'TypeScript input' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'JavaScript output' })).toBeInTheDocument()
    expect(editors()).toHaveLength(2)
  })

  it('keeps compiler options behind a disclosure and exposes Strict as a switch', () => {
    renderTool(TsPlayground)
    const toggle = screen.getByRole('button', { name: /Options/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Target')).toHaveValue('ESNext')
    expect(screen.getByLabelText('Module')).toHaveValue('ESNext')
    // Was a raw <input type="checkbox"> with no accessible name of its own.
    expect(screen.getByRole('switch', { name: 'Strict' })).toHaveAttribute('aria-checked', 'true')
  })

  it('offers the example and the compile action only when they apply', async () => {
    renderTool(TsPlayground)
    typeCode('')

    expect(screen.getByRole('button', { name: /Compile/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save output to file' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Load example' }))
    expect(editors()[0]!.value).toContain('interface User')
    expect(screen.queryByRole('button', { name: 'Load example' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Compile/ })).toBeEnabled())
  })

  it('registers the file actions the shell shortcuts rely on', () => {
    const tool = TOOLS.find((t) => t.id === 'ts-playground')
    expect(tool?.supportsOpenFile).toBe(true)
    expect(tool?.supportsSaveFile).toBe(true)
  })

  it('describes problem counts in words', () => {
    expect(describeProblems([])).toBe('No problems')
    expect(describeProblems([{ message: 'x', category: 'error', code: 1 }])).toBe('1 error')
    expect(
      describeProblems([
        { message: 'x', category: 'error', code: 1 },
        { message: 'y', category: 'error', code: 2 },
        { message: 'z', category: 'warning', code: 3 },
      ])
    ).toBe('2 errors, 1 warning')
    // Suggestions used to be lumped in with warnings and reported as such.
    expect(
      describeProblems([
        { message: 'x', category: 'warning', code: 1 },
        { message: 'y', category: 'suggestion', code: 2 },
      ])
    ).toBe('1 warning, 1 suggestion')
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // These only pass against the real TypeScript compiler behind the worker
  // mock; a no-op mock never resolves and the output pane stays empty.

  it('transpiles TS input to JS output via the real typescript worker', async () => {
    renderTool(TsPlayground)
    typeCode('const greet = (n: string): string => `hi ${n}`')

    await waitFor(() => {
      expect(editors()[1]).toHaveValue('"use strict";\nconst greet = (n) => `hi ${n}`;\n')
    }, WAIT)
  })

  // The checker used to run with `noLib`, so the tool's own example reported
  // "Cannot find name 'console'" and "Property 'map' does not exist on type '{}'".
  it('type-checks against the real standard library', async () => {
    renderTool(TsPlayground)

    await waitFor(() => {
      expect(problems().getByText('No problems found.')).toBeInTheDocument()
    }, WAIT)
    expect(screen.getByRole('status')).toHaveTextContent('No problems')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a real diagnostic with its position, severity and code', async () => {
    renderTool(TsPlayground)
    typeCode('const x: number = "not a number"')

    const entry = await screen.findByText(/not assignable/i, undefined, WAIT)
    const row = entry.closest('li')!
    expect(within(row).getByText('1:7')).toBeInTheDocument()
    expect(within(row).getByText('TS2322')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 error')
  })

  it('collapses the problems panel without losing the count', async () => {
    renderTool(TsPlayground)
    typeCode('const x: number = "not a number"')
    await screen.findByText(/not assignable/i, undefined, WAIT)

    fireEvent.click(screen.getByRole('button', { name: /Problems/ }))
    expect(screen.queryByText(/not assignable/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Problems/ })).toHaveTextContent('1')
  })

  // Every debounced keystroke used to fire a "N diagnostic(s)" toast.
  it('only announces a compile the user asked for', async () => {
    renderTool(TsPlayground)
    typeCode('const x: number = "not a number"')

    await screen.findByText(/not assignable/i, undefined, WAIT)
    expect(useUiStore.getState().lastAction).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Compile/ }))
    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({ message: '1 error', type: 'info' })
    }, WAIT)
  })

  // The superseded run's teardown used to clear the announce flag, so asking
  // for a second compile before the first came back said nothing at all.
  it('announces an explicit compile that supersedes one already in flight', async () => {
    renderTool(TsPlayground)
    typeCode('const ok: number = 1')

    const compile = screen.getByRole('button', { name: /Compile/ })
    fireEvent.click(compile)
    fireEvent.click(compile)

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Compiled',
        type: 'success',
      })
    }, WAIT)
  })

  it('recompiles when the target changes', async () => {
    renderTool(TsPlayground)
    typeCode('const greet = (n: string) => `hi ${n}`')
    await waitFor(() => expect(editors()[1]!.value).toContain('=>'), WAIT)

    fireEvent.click(screen.getByRole('button', { name: /Options/ }))
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'ES5' } })

    await waitFor(() => expect(editors()[1]!.value).toContain('function'), WAIT)
  })

  it('loads an opened file and saves the compiled output beside its name', async () => {
    renderTool(TsPlayground)

    act(() => {
      dispatchToolAction({ type: 'open-file', content: 'const a: number = 1', filename: 'math.ts' })
    })
    expect(editors()[0]).toHaveValue('const a: number = 1')
    expect(screen.getByText('math.ts')).toBeInTheDocument()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened math.ts' })

    await waitFor(() => expect(editors()[1]!.value).toContain('const a = 1'), WAIT)

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => {
      expect(saveFileDialog).toHaveBeenCalledWith(expect.stringContaining('const a = 1'), 'math.js')
    })
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Saved /tmp/output.js' })
  })

  it('refuses to open a save dialog with nothing compiled', async () => {
    renderTool(TsPlayground)
    typeCode('')
    await waitFor(() => expect(editors()[1]).toHaveValue(''))

    act(() => dispatchToolAction({ type: 'save-file' }))
    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Nothing to save yet' })
  })

  it('clears the output and the problems when the editor is emptied', async () => {
    renderTool(TsPlayground)
    typeCode('const x: number = "not a number"')
    await screen.findByText(/not assignable/i, undefined, WAIT)

    typeCode('')
    await waitFor(() => {
      expect(problems().getByText('Nothing to compile yet.')).toBeInTheDocument()
    })
    expect(editors()[1]).toHaveValue('')
  })
})

describe('typescript worker api', () => {
  it('checks against the standard library and says so', () => {
    const result = transpile('const ids = [1, 2].map(String)\nconsole.log(ids)')
    expect(result.typesChecked).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  // ES5's default library is `lib.d.ts`, which a `lib.*.d.ts` glob misses — the
  // packaged app then reported "types are not checked" for that target alone.
  it.each(['ES5', 'ES2015', 'ES2020', 'ESNext'])('loads the standard library for %s', (t) => {
    const result = transpile('console.log([1].map(String))', { target: t })
    expect(result.typesChecked).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  it('still reports genuine type errors', () => {
    const result = transpile('const x: number = "nope"')
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({ category: 'error', code: 2322, line: 1 })
  })

  it('honours strict mode', () => {
    const code = 'function f(a) { return a }'
    expect(transpile(code, { strict: true })).toMatchObject({
      diagnostics: [expect.objectContaining({ code: 7006 })],
    })
    expect(transpile(code, { strict: false })).toMatchObject({ diagnostics: [] })
  })
})
