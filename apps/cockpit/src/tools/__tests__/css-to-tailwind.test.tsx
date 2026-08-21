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
    expect(screen.getByText('mx-[1rem]')).toBeInTheDocument()
    expect(screen.getByText('py-[2rem]')).toBeInTheDocument()
  })

  it('shows empty state when no input', () => {
    renderTool(CssToTailwind)
    expect(screen.getByText('Enter CSS on the left to convert')).toBeInTheDocument()
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
