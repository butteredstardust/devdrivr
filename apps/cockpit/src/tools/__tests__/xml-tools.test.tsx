import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
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
})
