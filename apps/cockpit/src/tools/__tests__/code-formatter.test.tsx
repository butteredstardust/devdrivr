import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderTool } from './test-utils'
import CodeFormatter from '../code-formatter/CodeFormatter'
import {
  LANGUAGES,
  languageFromFilename,
  supportsJsStyleOptions,
  supportsQuoteStyle,
} from '@/tools/code-formatter/languages'
import { format, getSupportedLanguages } from '@/workers/formatter.api'
import { FORMATTER_WORKER_METHODS } from '@/workers/formatter.methods'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import { CODE_FORMATTER_SAMPLES } from '@/lib/tool-samples'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

const MESSY_JS = 'const   x={a:1,b:2}'
const PRETTY_JS = 'const x = { a: 1, b: 2 }\n'

function typeCode(value: string) {
  fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value } })
}

describe('CodeFormatter', () => {
  beforeEach(() => {
    vi.mocked(saveFileDialog).mockReset()
  })

  it('declares every formatter worker API method', () => {
    expect(FORMATTER_WORKER_METHODS).toEqual(['format', 'detectLanguage', 'getSupportedLanguages'])
  })

  it('renders format button', () => {
    renderTool(CodeFormatter)
    expect(screen.getByRole('button', { name: /Format/ })).toBeInTheDocument()
  })

  it('renders language selector', () => {
    renderTool(CodeFormatter)
    expect(screen.getByLabelText('Language')).toHaveValue('javascript')
  })

  it('renders editor', () => {
    renderTool(CodeFormatter)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('guides the user when the editor is empty and hides the hint once code arrives', () => {
    renderTool(CodeFormatter)
    expect(screen.getByText('Paste or type code to format')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to format yet')

    typeCode(MESSY_JS)
    expect(screen.queryByText('Paste or type code to format')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Not formatted yet')
  })

  it('keeps style options behind a disclosure so the toolbar stays narrow', () => {
    renderTool(CodeFormatter)
    const toggle = screen.getByRole('button', { name: /Style/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Indent width')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Indent width')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Single quotes' })).toBeInTheDocument()
  })

  // `trailingComma` was in persisted state with no control anywhere in the UI —
  // the value could only ever be its default.
  it('exposes the trailing-comma option and disables JS-only options for other languages', () => {
    renderTool(CodeFormatter)
    fireEvent.click(screen.getByRole('button', { name: /Style/ }))

    const trailingComma = screen.getByLabelText('Trailing commas')
    expect(trailingComma).toHaveValue('es5')
    expect(trailingComma).not.toBeDisabled()

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'css' } })
    expect(screen.getByLabelText('Trailing commas')).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Semicolons' })).toBeDisabled()
  })

  it('loads globally opened file content into the editor', () => {
    renderTool(CodeFormatter)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'const answer=42',
        filename: 'answer.ts',
      })
    })

    expect(screen.getByTestId('monaco-editor')).toHaveValue('const answer=42')
  })

  it('selects the language from the opened filename and reports the open', () => {
    renderTool(CodeFormatter)

    act(() => {
      dispatchToolAction({
        type: 'open-file',
        content: 'a{color:red}',
        filename: 'theme.scss',
      })
    })

    expect(screen.getByLabelText('Language')).toHaveValue('scss')
    expect(screen.getByText('theme.scss')).toBeInTheDocument()
    // Previously the "Opened" toast only fired when language detection *failed*.
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Opened theme.scss',
      type: 'success',
    })
  })

  it('saves current output and handles cancellation', async () => {
    vi.mocked(saveFileDialog).mockResolvedValueOnce('/tmp/formatted.js').mockResolvedValueOnce(null)
    renderTool(CodeFormatter)

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith('', 'formatted.js'))

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledTimes(2))
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Save cancelled',
      type: 'info',
    })
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // These only pass if the format button actually drives the real prettier
  // worker logic through the RPC mock — a no-op worker mock never resolves
  // and the editor value would never change.

  it('reformats messy JS into prettier output via the real formatter worker', async () => {
    renderTool(CodeFormatter)

    typeCode(MESSY_JS)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply format' }))

    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveValue(PRETTY_JS)
    })
    expect(useUiStore.getState().lastAction).toMatchObject({
      message: 'Formatted',
      type: 'success',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Formatted')
  })

  it('reports a no-op format instead of claiming it changed something', async () => {
    renderTool(CodeFormatter)
    typeCode(PRETTY_JS)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Already formatted',
        type: 'info',
      })
    })
    // Nothing changed, so there is nothing to revert to.
    expect(screen.getByRole('button', { name: /Revert/ })).toBeDisabled()
  })

  // Formatting rewrites the buffer in place and resets Monaco's undo stack, so
  // without this the original code is simply gone.
  it('restores the pre-format code when reverting', async () => {
    renderTool(CodeFormatter)
    const revert = screen.getByRole('button', { name: /Revert/ })

    typeCode(MESSY_JS)
    expect(revert).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply format' }))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue(PRETTY_JS))
    expect(revert).toBeEnabled()

    fireEvent.click(revert)
    expect(screen.getByTestId('monaco-editor')).toHaveValue(MESSY_JS)
    expect(revert).toBeDisabled()
  })

  it('marks the document as edited after a format and stops offering the revert', async () => {
    renderTool(CodeFormatter)

    typeCode(MESSY_JS)
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply format' }))
    await waitFor(() => expect(screen.getByTestId('monaco-editor')).toHaveValue(PRETTY_JS))

    typeCode(`${PRETTY_JS}const y = 1`)
    expect(screen.getByRole('status')).toHaveTextContent('Edited since last format')
    expect(screen.getByRole('button', { name: /Revert/ })).toBeDisabled()
  })

  it('surfaces a real parse error from the formatter worker', async () => {
    renderTool(CodeFormatter)

    typeCode('const x = {')
    fireEvent.click(screen.getByRole('button', { name: /Format/ }))

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Format error',
        type: 'error',
      })
    })
    // Formatting errors now use the shared ProblemsList rather than an alert;
    // keep the assertion on the actual worker message.
    expect(await screen.findByText(/Unexpected token/)).toBeInTheDocument()
  })

  it('auto-detects JSON via the real formatter worker', async () => {
    renderTool(CodeFormatter)

    typeCode('{"a":1}')
    fireEvent.click(screen.getByRole('button', { name: /Auto-detect/ }))

    await waitFor(() => {
      expect(useUiStore.getState().lastAction).toMatchObject({
        message: 'Detected: JSON',
        type: 'info',
      })
    })
  })

  it('disables actions that need code until there is code', () => {
    renderTool(CodeFormatter)
    expect(screen.getByRole('button', { name: /Format/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Auto-detect/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save to file' })).toBeDisabled()
  })
})

describe('formatter languages', () => {
  it('maps filenames onto languages, including aliases', () => {
    expect(languageFromFilename('app.tsx')).toBe('typescript')
    expect(languageFromFilename('theme.scss')).toBe('scss')
    expect(languageFromFilename('query.gql')).toBe('graphql')
    expect(languageFromFilename('config.yaml')).toBe('yaml')
    expect(languageFromFilename('LICENSE')).toBeNull()
    expect(languageFromFilename('notes.unknown')).toBeNull()
  })

  it('limits JS-grammar style options to JavaScript and TypeScript', () => {
    expect(supportsJsStyleOptions('javascript')).toBe(true)
    expect(supportsJsStyleOptions('typescript')).toBe(true)
    expect(supportsJsStyleOptions('css')).toBe(false)
    expect(supportsJsStyleOptions('sql')).toBe(false)
  })

  it('limits the quote-style option to languages prettier quotes', () => {
    expect(supportsQuoteStyle('css')).toBe(true)
    expect(supportsQuoteStyle('markdown')).toBe(false)
    expect(supportsQuoteStyle('sql')).toBe(false)
  })
})

// The language picker advertised css/scss/less/graphql, but the standalone
// prettier bundle had neither the postcss nor the graphql plugin registered, so
// every one of them threw "Couldn't resolve parser". Every language the picker
// offers is exercised here so a dropped plugin can never ship silently again.
const SAMPLES: Record<string, string> = {
  javascript: 'const   x={a:1}',
  typescript: 'const   x:number=1',
  json: '{"a":1}',
  css: 'a{color:red}',
  scss: '.a{ .b{color:red} }',
  less: '.a{ .b{color:red} }',
  html: '<div><p>hi</p></div>',
  markdown: '# Title\n\ntext',
  yaml: 'a:   1',
  xml: '<root><a>1</a></root>',
  sql: 'select 1',
  graphql: '{ user { id } }',
}

describe('formatter parser coverage', () => {
  it.each(LANGUAGES.map((l) => [l.id] as const))('formats %s', async (id) => {
    const source = SAMPLES[id]
    expect(source, `add a sample for the "${id}" language`).toBeDefined()
    await expect(format(source as string, { language: id })).resolves.toBeTruthy()
  })

  // The UI list and the worker's parser table are deliberately separate modules
  // (prettier must not reach the main bundle), so they can drift apart.
  it('offers only languages the worker can actually format', () => {
    const supported = new Set(getSupportedLanguages())
    for (const language of LANGUAGES) {
      expect(supported.has(language.id), `${language.id} is missing a parser`).toBe(true)
    }
  })
})

describe('CodeFormatter — Load sample', () => {
  it('names the selected language and loads a sample in it', () => {
    renderTool(CodeFormatter)

    // The label names the language because the sample depends on it — loading
    // JavaScript into a buffer set to SQL would format it as SQL.
    fireEvent.click(screen.getByRole('button', { name: 'Load JavaScript sample' }))

    expect((screen.getByTestId('monaco-editor') as HTMLTextAreaElement).value).toContain(
      'const orders='
    )
    expect(screen.queryByRole('button', { name: /Load .* sample/ })).not.toBeInTheDocument()
  })

  it('follows the language selector', () => {
    renderTool(CodeFormatter)

    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: 'sql' } })

    expect(screen.getByRole('button', { name: 'Load SQL sample' })).toBeInTheDocument()
  })

  it('has a sample for every supported language', () => {
    // The button renders only when a sample exists, so a language added without
    // one loses the affordance silently — which reads as a bug, not a decision.
    const missing = LANGUAGES.filter((l) => !CODE_FORMATTER_SAMPLES[l.id]).map((l) => l.id)
    expect(missing).toEqual([])
  })
})
