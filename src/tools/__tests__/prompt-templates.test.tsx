import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { installNarrowToolbarLayout, renderTool } from './test-utils'
import { usePromptTemplatesStore } from '@/stores/prompt-templates.store'
import { useUiStore } from '@/stores/ui.store'
import PromptTemplates from '@/tools/prompt-templates/PromptTemplates'
import { BUILTIN_PROMPT_TEMPLATES } from '@/tools/prompt-templates/builtin-templates'
import {
  parsePromptTemplateImport,
  serializePromptTemplateExport,
} from '@/lib/prompt-template-transfer'
import { estimateTokens, renderPrompt, tokenTone } from '@/tools/prompt-templates/template-utils'

const originalClipboard = navigator.clipboard
const fileIoMocks = vi.hoisted(() => ({
  openFileDialog: vi.fn(),
  exportFile: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  loadToolState: vi.fn().mockResolvedValue(null),
  saveToolState: vi.fn().mockResolvedValue(undefined),
  loadUserPromptTemplates: vi.fn().mockResolvedValue([]),
  saveUserPromptTemplate: vi.fn().mockResolvedValue(undefined),
  saveUserPromptTemplates: vi.fn().mockResolvedValue(undefined),
  deleteUserPromptTemplate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/file-io', () => ({
  buildExportFilename: (name: string, extension: string) => `${name}.${extension}`,
  openFileDialog: fileIoMocks.openFileDialog,
  exportFile: fileIoMocks.exportFile,
}))

beforeEach(() => {
  useUiStore.setState({ lastAction: null, toasts: [] })
  usePromptTemplatesStore.setState({ userTemplates: [], initialized: true, saving: false })
  fileIoMocks.openFileDialog.mockReset().mockResolvedValue(null)
  fileIoMocks.exportFile.mockReset().mockResolvedValue('/tmp/devdrivr-prompt-templates-backup.json')
})

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true })
})

describe('prompt template utilities', () => {
  it('renders placeholders with supplied values', () => {
    const template = BUILTIN_PROMPT_TEMPLATES.find(
      (item) => item.id === 'code/unit-tests-for-function'
    )!
    const rendered = renderPrompt(template, {
      framework: 'Vitest with TypeScript',
      code: 'export function add(a: number, b: number) { return a + b }',
      specification: '',
      existing_test_example: '',
    })

    expect(rendered).toContain('Vitest')
    expect(rendered).toContain('export function add')
    expect(rendered).not.toContain('{{code}}')
  })

  it('declares every prompt placeholder and uses every declared variable', () => {
    for (const template of BUILTIN_PROMPT_TEMPLATES) {
      const placeholders = new Set(
        [...template.prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1])
      )
      const variables = new Set(template.variables.map((variable) => variable.name))

      expect(placeholders, template.id).toEqual(variables)
    }
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
        category: 'engineering',
      })
    )

    expect(drafts).toHaveLength(1)
    expect(drafts[0]!.variables.map((variable) => variable.name)).toEqual(['code', 'context'])
    expect(drafts[0]!.variables[0]!.type).toBe('textarea')
  })

  it('round-trips the versioned export envelope and accepts legacy arrays', () => {
    const draft = {
      name: 'Portable prompt',
      description: '',
      category: 'engineering' as const,
      tags: [],
      prompt: 'Test {{code}}',
      variables: [],
      estimatedTokens: 3,
      optimizedFor: 'Generic' as const,
      version: '1.0.0',
      tips: [],
      language: 'en',
      example: { code: 'export const value = 1' },
      source: {
        library: 'PromtExpress OSS',
        templateId: 'code/unit-tests-for-function',
        authors: ['SpicesFire'],
        license: 'MIT',
        url: 'https://github.com/WebitroHQ/promtexpress-oss',
      },
    }
    const serialized = serializePromptTemplateExport([draft])
    expect(JSON.parse(serialized)).toMatchObject({
      format: 'devdrivr-prompt-templates',
      version: 1,
      exportedAt: expect.any(String),
      templates: [draft],
    })
    expect(parsePromptTemplateImport(serialized)[0]).toMatchObject({
      language: 'en',
      example: draft.example,
      source: draft.source,
    })
    expect(parsePromptTemplateImport(JSON.stringify([draft]))).toHaveLength(1)
  })

  it('imports legacy categories and remaps them to the current set', () => {
    const [draft] = parsePromptTemplateImport(
      JSON.stringify({ name: 'Legacy tests', prompt: 'Test {{code}}', category: 'testing' })
    )

    expect(draft?.category).toBe('engineering')
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
    ).toThrow(/Select variables require at least one option/)
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
    ).toThrow(/Select variables require at least one option/)
  })
})

describe('PromptTemplates', () => {
  it('keeps snippet handoff reachable through the toolbar overflow menu', () => {
    const restoreLayout = installNarrowToolbarLayout()
    try {
      renderTool(PromptTemplates)

      const toolbar = screen.getByRole('toolbar', { name: 'Prompt template actions' })
      fireEvent.click(within(toolbar).getByRole('button', { name: 'More actions' }))
      const menu = screen.getByRole('dialog', { name: 'More actions' })

      expect(within(menu).getByRole('button', { name: 'Send to snippet' })).toBeInTheDocument()
    } finally {
      restoreLayout()
    }
  })

  it('renders the template library and switches between fill and preview workspaces', () => {
    renderTool(PromptTemplates)

    expect(screen.getAllByText('Podcast intro voice-over').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: /fill variables/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    fireEvent.click(screen.getByRole('tab', { name: /preview/i }))
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  it('filters templates by search text', () => {
    renderTool(PromptTemplates)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search prompt templates' }), {
      target: { value: 'SQL query' },
    })

    expect(screen.getByText('SQL Query from Question')).toBeInTheDocument()
    expect(
      within(screen.getByRole('listbox', { name: 'Prompt templates' })).queryByText(
        'Podcast intro voice-over'
      )
    ).not.toBeInTheDocument()
  })

  it('opens quick fill, fills variables, and copies the rendered prompt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
    })

    renderTool(PromptTemplates)
    fireEvent.click(screen.getByText('Unit tests for a function'))
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }))

    const dialog = screen.getByRole('dialog', { name: 'Unit tests for a function' })
    const codeField = within(dialog).getByLabelText('Code')
    fireEvent.change(codeField, {
      target: { value: 'export const double = (value: number) => value * 2' },
    })
    fireEvent.change(within(dialog).getByLabelText('Framework'), {
      target: { value: 'Vitest with TypeScript' },
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
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }))

    await waitFor(() => expect(useUiStore.getState().lastAction?.type).toBe('error'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('keeps Cmd+F focus inside the quick-fill modal', async () => {
    renderTool(PromptTemplates)

    const searchInput = screen.getByRole('searchbox', { name: 'Search prompt templates' })
    fireEvent.click(screen.getByRole('button', { name: 'Focus mode' }))
    const dialog = screen.getByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'f', metaKey: true })

    await waitFor(() => expect(document.activeElement).not.toBe(searchInput))
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes quick fill on Escape and hands focus back to the trigger', async () => {
    renderTool(PromptTemplates)

    const trigger = screen.getByRole('button', { name: 'Focus mode' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(trigger)
  })

  it('moves focus into the template editor and traps Tab inside it', async () => {
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))

    // Shift-Tab from the first field wraps to the last control rather than escaping to the page.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('opens quick fill with Enter when focus is not in an interactive field', async () => {
    renderTool(PromptTemplates)

    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('exposes the selected template state for assistive tech', () => {
    renderTool(PromptTemplates)

    const selectedRow = screen.getAllByText('Podcast intro voice-over')[0]!.closest('button')

    expect(selectedRow).toHaveAttribute('aria-selected', 'true')
  })

  it('shows upstream attribution and variable help for built-in templates', () => {
    renderTool(PromptTemplates)

    expect(screen.getByRole('link', { name: 'PromtExpress OSS' })).toHaveAttribute(
      'href',
      'https://github.com/WebitroHQ/promtexpress-oss'
    )
    expect(screen.getByText('Name of the podcast')).toBeInTheDocument()
    expect(screen.getByText(/@SpicesFire · MIT/)).toBeInTheDocument()
  })

  it('supports arrow-key navigation through the template library', () => {
    renderTool(PromptTemplates)

    const options = within(screen.getByRole('listbox', { name: 'Prompt templates' })).getAllByRole(
      'option'
    )
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' })

    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('tabindex', '0')
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

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate template' }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate Template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Template' }))

    await waitFor(() => expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1))
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.author).toBe('user')
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.name).toContain('(custom)')
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.source?.library).toBe(
      'PromtExpress OSS'
    )
    expect(usePromptTemplatesStore.getState().userTemplates[0]!.variables[0]!.description).toBe(
      'Name of the podcast'
    )
  })

  it('preserves upstream metadata when it customizes a built-in template', async () => {
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByRole('button', { name: 'Customize built-in template' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Prompt Template' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Template' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'PromtExpress OSS' })).toBeInTheDocument()
    expect(screen.getByText('Name of the podcast')).toBeInTheDocument()
  })

  it('requires explicit confirmation before deleting a custom template', async () => {
    const customTemplate = {
      ...BUILTIN_PROMPT_TEMPLATES[0]!,
      id: 'custom-review',
      name: 'Custom Review',
      author: 'user' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    usePromptTemplatesStore.setState({ userTemplates: [customTemplate] })
    renderTool(PromptTemplates)

    fireEvent.click(screen.getByText('Custom Review'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete template' }))

    expect(screen.getByRole('dialog', { name: 'Delete prompt template?' })).toBeInTheDocument()
    expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(1)

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete prompt template?' })).getByRole('button', {
        name: 'Delete template',
      })
    )
    await waitFor(() => expect(usePromptTemplatesStore.getState().userTemplates).toHaveLength(0))
  })

  it('exports and imports custom templates through native JSON files', async () => {
    const filePayload = JSON.stringify([
      {
        name: 'Imported Prompt',
        prompt: 'Summarize {{notes}}',
        category: 'productivity',
        tags: ['summary'],
      },
    ])
    fileIoMocks.openFileDialog.mockResolvedValue({
      content: filePayload,
      filename: 'templates.json',
      path: '/tmp/templates.json',
    })

    renderTool(PromptTemplates)
    fireEvent.click(screen.getByRole('button', { name: 'Import templates from JSON' }))

    await waitFor(() => expect(screen.getAllByText('Imported Prompt').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Export custom templates as JSON' }))

    await waitFor(() => expect(fileIoMocks.exportFile).toHaveBeenCalledTimes(1))
    expect(fileIoMocks.exportFile).toHaveBeenCalledWith(
      expect.stringContaining('Imported Prompt'),
      'devdrivr-prompt-templates-backup.json'
    )
  })
})
