import { describe, expect, it } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { renderTool } from '@/tools/__tests__/test-utils'
import XmlTools from '@/tools/xml-tools/XmlTools'
import { evaluateSimpleXPath } from '@/lib/xml-xpath'

describe('XmlTools', () => {
  it('renders tab bar', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Lint & Format')).toBeInTheDocument()
    expect(screen.getByText('Tree View')).toBeInTheDocument()
    expect(screen.getByText('XPath')).toBeInTheDocument()
  })

  it('renders editor in Lint tab', () => {
    renderTool(XmlTools)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('shows Format and Validate buttons', () => {
    renderTool(XmlTools)
    expect(screen.getByText('Format')).toBeInTheDocument()
    expect(screen.getByText('Validate')).toBeInTheDocument()
  })

  it('switches to XPath tab', () => {
    renderTool(XmlTools)
    fireEvent.click(screen.getByText('XPath'))
    expect(screen.getByPlaceholderText(/xpath/i)).toBeInTheDocument()
  })

  it('matches absolute XPath expressions that include the root element', () => {
    const doc = new DOMParser().parseFromString('<root><child>1</child></root>', 'text/xml')
    const serializer = new XMLSerializer()

    const matches = evaluateSimpleXPath(doc, '/root/child').map((node) =>
      serializer.serializeToString(node)
    )

    expect(matches).toEqual(['<child>1</child>'])
  })

  it('matches descendant XPath expressions', () => {
    const doc = new DOMParser().parseFromString(
      '<root><wrapper><child>1</child></wrapper></root>',
      'text/xml'
    )
    const serializer = new XMLSerializer()

    const matches = evaluateSimpleXPath(doc, '//child').map((node) =>
      serializer.serializeToString(node)
    )

    expect(matches).toEqual(['<child>1</child>'])
  })

  // ── Worker round-trip ────────────────────────────────────────────
  // A no-op worker mock never resolves validate()/format(), so the error
  // banner or the reformatted editor value never appears — these only pass
  // against the real @xmldom/xmldom-backed worker logic via the RPC mock.

  it('reports a real parser error for malformed XML via Validate', async () => {
    renderTool(XmlTools)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: '<root><unclosed></root>' } })
    fireEvent.click(screen.getByText('Validate'))

    await waitFor(() => {
      expect(screen.getByText(/tag mismatch/i)).toBeInTheDocument()
    })
  })

  it('reformats XML into indented output via the real worker', async () => {
    renderTool(XmlTools)
    const editor = screen.getByTestId('monaco-editor')

    fireEvent.change(editor, { target: { value: '<root><a>1</a></root>' } })
    fireEvent.click(screen.getByText('Format'))

    await waitFor(() => {
      expect(editor).toHaveValue('<root>\n  <a>1</a>\n</root>')
    })
  })
})
