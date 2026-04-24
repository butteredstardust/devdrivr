import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from './test-utils'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import PromptTemplates from '@/tools/prompt-templates/PromptTemplates'
import { BUILTIN_PROMPT_TEMPLATES } from '@/tools/prompt-templates/builtin-templates'
import { parsePromptTemplateImport } from '@/tools/prompt-templates/template-import'
import { estimateTokens, renderPrompt, tokenTone } from '@/tools/prompt-templates/template-utils'

const originalClipboard = navigator.clipboard

vi.mock('@/lib/db', () => ({
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  loadUserPromptTemplates: vi.fn().mockResolvedValue([]),
  saveUserPromptTemplate: vi.fn().mockResolvedValue(undefined),
  saveUserPromptTemplates: vi.fn().mockResolvedValue(undefined),
  deleteUserPromptTemplate: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  useUiStore.setState({ lastAction: null, toasts: [] })
  usePromptTemplatesStore.setState({ userTemplates: [], initialized: true, saving: false })
})

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true })
})

describe('prompt template utilities', () => {
  it('renders placeholders with supplied values', () => {
    const template = BUILTIN_PROMPT_TEMPLATES.find((item) => item.id === 'generate-unit-tests')!
    const rendered = renderPrompt(template, {
      language: 'TypeScript',
      framework: 'Vitest',
      code: 'export function add(a: number, b: number) { return a + b }',
    })

    expect(rendered).toContain('TypeScript')
    expect(rendered).toContain('Vitest')
    expect(rendered).toContain('export function add')
    expect(rendered).not.toContain('{{code}}')
  })

  it('estimates token count and warning tone from rendered text', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(8004))).toBe(2001)
    expect(tokenTone(1999)).toBe('success')
    expect(tokenTone(2500)).toBe('warning')
    expect(tokenTone(4500)).toBe('error')
  })

  it('parses import JSON and derives variables from placeholders', () => {
    const drafts = parsePromptTemplateImport(
      JSON.stringify({
        name: 'Custom Debug Prompt',
        prompt: 'Review {{code}} with {{context}}',
        category: 'debugging',
      })
    )

    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.variables.map((variable) => variable.name)).toEqual(['code', 'context'])
    expect(drafts[0]!.variables[0]!.type).toBe('textarea')
  })

  it('rejects invalid import JSON', () => {
    expect(() => parsePromptTemplateImport('{bad json')).toThrow(/valid JSON/)
  })

  it('rejects select variables without options on import', () => {
    expect(() =>
      parsePromptTemplateImport(
        JSON.stringify({
          name: 'Broken Select',
          prompt: 'Use {{language}}',
          variables: [{ name: 'language', type: 'select' }],
        })
      )
    ).toThrow(/prompt template format/)
  })

  it('rejects select variables with only blank options on import', () => {
    expect(() =>
      parsePromptTemplateImport(
        JSON.stringify({
          name: 'Broken Blank Select',
          prompt: 'Use {{language}}',
          variables: [{ name: 'language', type: 'select', options: ['  '] }],
        })
      )
    ).toThrow(/prompt template format/)
  })
})

describe('PromptTemplates', () => {
  it('renders the template library and preview panes', () => {
    renderTool(PromptTemplates)

    expect(screen.getAllByText('Review: Detect Code Smells').length).toBeGreaterThan(0)
    expect(screen.getByText('[ 02-FILL ]')).toBeInTheDocument()
    expect(screen.getByText('[ 03-PREVIEW ]')).toBeInTheDocument()
  })

  it('filters templates by search text', () => {
    renderTool(PromptTemplates)

    fireEvent.change(screen.getByPlaceholderText(/search prompts/i), {
      target: { value: 'stack trace' },
    })

    expect(screen.getByText('Debug: Stack Trace')).toBeInTheDocument()
    expect(screen.queryByText('Generate: Unit Tests')).not.toBeInTheDocument()
  })

  it('opens quick fill, fills variables, and copies the rendered prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
    })

    renderTool(PromptTemplates)
    fireEvent.click(screen.getByText('Generate: Unit Tests'))
    fireEvent.click(screen.getByRole('button', { name: 'Quick Fill' }))

    const dialog = screen.getByRole('dialog', { name: 'Generate: Unit Tests' })
    const codeField = within(dialog).getByLabelText('Code')
    fireEvent.change(codeField, {
      target: { value: 'export const double = (value: number) => value * 2' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy to Clipboard' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('export const double'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Vitest'))
    expect(useUiStore.getState().lastAction?.type).toBe('success')
  })

  it('blocks copy when required variables are empty', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
    })

    renderTool(PromptTemplates)
    fireEvent.click(screen.getByRole('button', { name: 'Quick Fill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }))

    await waitFor(() => expect(useUiStore.getState().lastAction?.type).toBe('error'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('keeps Cmd+F focus inside the quick-fill modal', async () => {
    renderTool(PromptTemplates)

    const searchInput = screen.getByPlaceholderText(/search prompts/i)
    fireEvent.click(screen.getByRole('button', { name: 'Quick Fill' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'f', metaKey: true })

    await waitFor(() => expect(document.activeElement).not.toBe(searchInput))
  })

  it('opens quick fill with Enter when focus is not in an interactive field', async () => {
    renderTool(PromptTemplates)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('exposes the selected template state for assistive tech', () => {
    renderTool(PromptTemplates)

    const selectedRow = screen.getAllByText('Review: Detect Code Smells')[0]!.closest('button')

    expect(selectedRow).toHaveAttribute('aria-selected', 'true')
  })

  it('creates a custom template from the editor modal', async () => {
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Template' })

    fireEvent.change(within(dialog).getByLabelText('Template name'), {
      target: { value: 'Custom Review Prompt' },
    })
    fireEvent.change(within(dialog).getByLabelText('Prompt body'), {
      target: { value: 'Review {{code}} for correctness.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Template' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getAllByText('Custom Review Prompt').length).toBeGreaterThan(0)
    expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1)
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.variables[0]!.name).toBe('code')
  })

  it('lets select variables define options before saving', async () => {
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Template' })

    fireEvent.change(within(dialog).getByLabelText('Template name'), {
      target: { value: 'Language Prompt' },
    })
    fireEvent.change(within(dialog).getByLabelText('Prompt body'), {
      target: { value: 'Explain {{language}}' },
    })
    fireEvent.change(within(dialog).getByLabelText('language type'), {
      target: { value: 'select' },
    })
    fireEvent.change(within(dialog).getByLabelText('language options'), {
      target: { value: 'TypeScript, Rust' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Template' }))

    await waitFor(() => expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1))
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.variables[0]!.options).toEqual([
      'TypeScript',
      'Rust',
    ])
  })

  it('duplicates a built-in template as an editable custom template', async () => {
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate Template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Template' }))

    await waitFor(() => expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1))
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.author).toBe('user')
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.name).toContain('(custom)')
  })

  it('exports and imports custom templates through clipboard JSON', async () => {
    const clipboardPayload = JSON.stringify([
      {
        name: 'Imported Prompt',
        prompt: 'Summarize {{notes}}',
        category: 'productivity',
        tags: ['summary'],
      },
    ])
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn().mockResolvedValue(clipboardPayload), writeText },
      writable: true,
    })

    renderTool(PromptTemplates)
    fireEvent.click(screen.getByText('[F10: IMP]'))

    await waitFor(() => expect(screen.getAllByText('Imported Prompt').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByText('[F9: EXP]'))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Imported Prompt'))
  })
})
