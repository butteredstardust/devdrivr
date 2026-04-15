import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderTool } from './test-utils'
import { useUiStore } from '@/stores/ui.store'
import PromptTemplates from '../prompt-templates/PromptTemplates'
import { BUILTIN_PROMPT_TEMPLATES } from '../prompt-templates/builtin-templates'
import { estimateTokens, renderPrompt, tokenTone } from '../prompt-templates/template-utils'

const originalClipboard = navigator.clipboard

beforeEach(() => {
  useUiStore.setState({ lastAction: null, toasts: [] })
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
})
