import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderTool } from './test-utils'
import CssToTailwind from '../css-to-tailwind/CssToTailwind'

describe('CssToTailwind', () => {
  it('renders editor and output panel', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('CSS Input')).toBeInTheDocument()
    expect(screen.getByText('Tailwind Output')).toBeInTheDocument()
  })

  it('converts CSS to Tailwind classes', () => {
    renderTool(CssToTailwind)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'display: flex;\npadding: 1rem;' } })
    expect(screen.getByText('flex')).toBeInTheDocument()
  })

  it('converts new properties correctly', () => {
    renderTool(CssToTailwind)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, {
      target: {
        value:
          'text-transform: uppercase;\nobject-fit: cover;\nmargin-inline: 1rem;\npadding-block: 2rem;',
      },
    })
    expect(screen.getByText('uppercase')).toBeInTheDocument()
    expect(screen.getByText('object-cover')).toBeInTheDocument()
    expect(screen.getAllByText('mx-4').length).toBeGreaterThan(0)
    expect(screen.getAllByText('py-8').length).toBeGreaterThan(0)
  })

  it('encodes spaces inside arbitrary values', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: 'width: calc(100% - 2rem);' },
    })
    expect(screen.getAllByText('w-[calc(100%_-_2rem)]').length).toBeGreaterThan(0)
  })

  it('keeps common border and percentage font-size declarations valid', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '.card { border: 1px solid red; font-size: 100%; }' },
    })
    expect(screen.getAllByText('border-solid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('border-[color:red]').length).toBeGreaterThan(0)
    expect(screen.getAllByText('text-[100%]').length).toBeGreaterThan(0)
    expect(screen.queryByText('text-full')).not.toBeInTheDocument()
    expect(screen.queryByText('border-[1px_solid_red]')).not.toBeInTheDocument()
  })

  it('uses valid zero utilities for font size, line height, and radius', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '.card { font-size: 0; line-height: 0; border-radius: 0; }' },
    })
    expect(screen.getAllByText('text-[0]').length).toBeGreaterThan(0)
    expect(screen.getAllByText('leading-[0]').length).toBeGreaterThan(0)
    expect(screen.getAllByText('rounded-none').length).toBeGreaterThan(0)
  })

  it('does not emit unconditional classes for unsupported media queries', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '@media (max-width: 600px) { .card { color: red; } }' },
    })
    expect(screen.getByText(/unsupported context/)).toBeInTheDocument()
    expect(screen.queryByText('text-[red]')).not.toBeInTheDocument()
  })

  it('uses a responsive variant only for an exact supported breakpoint', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '@media (min-width: 768px) { .card { display: grid; } }' },
    })
    expect(screen.getAllByText('md:grid').length).toBeGreaterThan(0)
  })

  it('keeps the screen media prefix and non-conditional layer rules', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: {
        value:
          '@media screen and (min-width: 768px) { .card { display: grid; } }\n@layer components { .card { display: flex; } }',
      },
    })
    expect(screen.getAllByText('md:grid').length).toBeGreaterThan(0)
    expect(screen.getAllByText('flex').length).toBeGreaterThan(0)
  })

  it('retains media variants through nested layer rules', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: {
        value: '@media (min-width: 768px) { @layer components { .card { display: grid; } } }',
      },
    })
    expect(screen.getAllByText('md:grid').length).toBeGreaterThan(0)
    expect(screen.queryByText('grid')).not.toBeInTheDocument()
  })

  it('does not discard an unsupported outer at-rule', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: {
        value:
          '@supports (display: grid) { @media (min-width: 768px) { .card { display: grid; color: red; } } }',
      },
    })
    expect(screen.getByText('@supports (unsupported context)')).toBeInTheDocument()
    expect(screen.queryByText('md:grid')).not.toBeInTheDocument()
  })

  it('shows empty state when no input', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('Enter CSS on the left to convert')).toBeInTheDocument()
  })

  it('groups output by selector and supports Tailwind v3 importance', () => {
    renderTool(CssToTailwind)
    fireEvent.change(screen.getByLabelText('Tailwind version'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('monaco-editor'), {
      target: { value: '.button { padding: 1rem !important; }' },
    })
    expect(screen.getByText('.button')).toBeInTheDocument()
    expect(screen.getAllByText('!p-4').length).toBeGreaterThan(0)
  })

  // `!important` used to be left on the value, where it defeated every map lookup and equality
  // check and then landed inside an arbitrary-value bracket: `text-[red !important]`. Tailwind v4
  // marks importance with a trailing `!`.
  describe('!important', () => {
    const convert = (css: string) => {
      renderTool(CssToTailwind)
      fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: css } })
    }

    it('keeps a mapped class resolvable and marks it important', () => {
      convert('display: flex !important;')
      expect(screen.getAllByText('flex!').length).toBeGreaterThan(0)
    })

    it('strips it out of arbitrary colour values', () => {
      convert('color: red !important;')
      expect(screen.getAllByText('text-[red]!').length).toBeGreaterThan(0)
    })

    it('strips it out of size values', () => {
      convert('width: 100px !important;')
      expect(screen.getAllByText('w-[100px]!').length).toBeGreaterThan(0)
    })

    it('still resolves keyword shortcuts', () => {
      convert('width: 100% !important;')
      expect(screen.getAllByText('w-full!').length).toBeGreaterThan(0)
    })

    it('tolerates whitespace before important', () => {
      convert('color: blue !  important;')
      expect(screen.getAllByText('text-[blue]!').length).toBeGreaterThan(0)
    })

    it('leaves ordinary declarations unmarked', () => {
      convert('color: red;')
      expect(screen.getAllByText('text-[red]').length).toBeGreaterThan(0)
    })

    it('echoes the original declaration when it cannot convert', () => {
      convert('mask-composite: subtract !important;')
      expect(screen.getAllByText(/mask-composite: subtract !important/).length).toBeGreaterThan(0)
    })
  })
})

describe('CssToTailwind — Load sample', () => {
  it('fills the editor and produces both converted and unconvertible output', () => {
    renderTool(CssToTailwind)

    // The empty state is the only thing on screen until something is entered,
    // and before this it offered no way out except knowing what to type.
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    expect((screen.getByTestId('monaco-editor') as HTMLTextAreaElement).value).toContain(
      'display: flex'
    )
    expect(screen.getByText('Converted Classes')).toBeInTheDocument()
    // The half that matters: a sample converting cleanly would never show this.
    expect(screen.getByText('Unconvertible')).toBeInTheDocument()
  })

  it('replaces the empty state rather than sitting alongside it', () => {
    renderTool(CssToTailwind)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
  })
})
