import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { renderTool } from '@/tools/__tests__/test-utils'
import XmlTools from '@/tools/xml-tools/XmlTools'
import { evaluateSimpleXPath } from '@/lib/xml-xpath'
import { queryXPath, validate } from '@/workers/xml.api'
import { dispatchToolAction } from '@/lib/tool-actions'
import { saveFileDialog } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'

vi.mock('@/lib/file-io', () => ({
  saveFileDialog: vi.fn(),
}))

function editor() {
  return screen.getByTestId('monaco-editor') as HTMLTextAreaElement
}

function typeXml(value: string) {
  fireEvent.change(editor(), { target: { value } })
}

function showView(name: 'Source' | 'Tree' | 'JSON' | 'XPath') {
  fireEvent.click(screen.getByRole('radio', { name }))
}

const SAMPLE = '<catalog><book id="b1"><title>Dune</title></book></catalog>'

describe('xml.api', () => {
  it('reports the location of a parse error', () => {
    const result = validate('<root>\n  <a>1</a>\n  <b><c></b>\n</root>')

    expect(result.valid).toBe(false)
    expect(result.issues[0]).toMatchObject({ level: 'fatalError', line: 3 })
    expect(result.issues[0]?.message).toMatch(/tag mismatch/i)
  })

  it('keeps a document with only warnings usable', () => {
    // An unquoted attribute is recoverable: xmldom still builds the tree, so
    // refusing to format it would be worse than saying nothing.
    const result = validate('<root>\n  <a attr=x>1</a>\n</root>')

    expect(result.issues.some((issue) => issue.level === 'warning')).toBe(true)
    expect(result.valid).toBe(true)
  })

  it('returns an XPath failure as an error rather than a match', () => {
    // It used to hand the error message back inside `matches`, so a broken
    // document rendered its own error as if it were a matched node.
    const result = queryXPath('<root><a>', '//a')

    expect(result.matches).toEqual([])
    expect(result.count).toBe(0)
    expect(result.error).toBeTruthy()
  })

  it('flags that predicates were ignored instead of quietly matching everything', () => {
    const result = queryXPath('<root><a>1</a><a>2</a></root>', '/root/a[1]')

    expect(result.count).toBe(2)
    expect(result.predicatesIgnored).toBe(true)
  })

  it('matches absolute and descendant XPath expressions', () => {
    const doc = new DOMParser().parseFromString(
      '<root><wrapper><child>1</child></wrapper></root>',
      'text/xml'
    )
    const serializer = new XMLSerializer()

    expect(evaluateSimpleXPath(doc, '//child').map((n) => serializer.serializeToString(n))).toEqual(
      ['<child>1</child>']
    )
    expect(
      evaluateSimpleXPath(doc, '/root/wrapper').map((n) => serializer.serializeToString(n))
    ).toEqual(['<wrapper><child>1</child></wrapper>'])
  })
})

describe('XmlTools', () => {
  beforeEach(() => {
    vi.mocked(saveFileDialog).mockReset()
    useUiStore.setState({ lastAction: null })
  })

  it('keeps the source editor and the inspector on screen together', async () => {
    renderTool(XmlTools)
    typeXml(SAMPLE)
    showView('Tree')

    // The panes used to be tabs that replaced the editor, so fixing a document
    // meant leaving the view that showed the problem.
    expect(screen.getByRole('region', { name: 'XML source' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tree view' })).toBeInTheDocument()
    expect(editor()).toHaveValue(SAMPLE)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Valid XML/))
  })

  it('validates as you type and describes the document shape', async () => {
    renderTool(XmlTools)
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to inspect yet')

    typeXml(SAMPLE)

    // No Validate button to press: the status line is the validator.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /Valid XML · 3 elements · 1 attribute · depth 3/
      )
    )
  })

  it('points at the line of a parse error and offers to jump to it', async () => {
    renderTool(XmlTools)
    typeXml('<root>\n  <a>1</a>\n  <b><c></b>\n</root>')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Invalid XML — .*line 3/)
    )
    expect(screen.getByRole('button', { name: /Go to error/ })).toBeInTheDocument()
  })

  it('formats and minifies through the editor buffer', async () => {
    renderTool(XmlTools)
    typeXml('<root><a>1</a></root>')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    await waitFor(() => expect(editor()).toHaveValue('<root>\n  <a>1</a>\n</root>'))

    fireEvent.click(screen.getByRole('button', { name: 'Minify' }))
    await waitFor(() => expect(editor()).toHaveValue('<root><a>1</a></root>'))
  })

  it('drops the failed-transform banner as soon as the document is edited', async () => {
    renderTool(XmlTools)
    typeXml('<root><unclosed></root>')

    fireEvent.click(screen.getByRole('button', { name: /Format/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/tag mismatch/i)

    typeXml('<root><a>1</a></root>')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('converts to JSON without waiting for a Convert click', async () => {
    renderTool(XmlTools)
    typeXml(SAMPLE)
    showView('JSON')

    // The old pane threw its output away on every keystroke and demanded a
    // click to rebuild it.
    await waitFor(() => {
      const panes = screen.getAllByTestId('monaco-editor') as HTMLTextAreaElement[]
      expect(panes[1]?.value).toContain('"title": "Dune"')
    })
  })

  it('runs XPath as you type and shows the match count', async () => {
    renderTool(XmlTools)
    typeXml(SAMPLE)
    showView('XPath')

    fireEvent.change(await screen.findByLabelText('XPath expression'), {
      target: { value: '//title' },
    })

    const pane = within(screen.getByRole('region', { name: 'XPath results' }))
    await waitFor(() => expect(pane.getByText('<title>Dune</title>')).toBeInTheDocument())
    expect(pane.getByText('1 match')).toBeInTheDocument()
  })

  it('warns that an XPath predicate was ignored', async () => {
    renderTool(XmlTools)
    typeXml('<root><a>1</a><a>2</a></root>')
    showView('XPath')

    fireEvent.change(await screen.findByLabelText('XPath expression'), {
      target: { value: '/root/a[1]' },
    })

    await waitFor(() => expect(screen.getByText(/Predicates are ignored/)).toBeInTheDocument())
  })

  it('keeps every match copyable from the keyboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(XmlTools)
    typeXml(SAMPLE)
    showView('XPath')
    fireEvent.change(await screen.findByLabelText('XPath expression'), {
      target: { value: '//title' },
    })

    // The copy affordance used to be hover-only, so it did not exist for
    // keyboard or touch users.
    const copyMatch = await screen.findByRole('button', { name: 'Copy match 1' })
    fireEvent.click(copyMatch)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('<title>Dune</title>'))
  })

  it('copies a whole element from the tree', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(XmlTools)
    typeXml(SAMPLE)
    showView('Tree')

    fireEvent.click(await screen.findByRole('button', { name: 'Copy <book> element' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('<book id="b1"><title>Dune</title></book>')
    )
  })

  it('re-escapes markup characters when copying a tree element', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderTool(XmlTools)
    // The parser hands back decoded values, so copying them straight out used to
    // produce XML that would not parse again.
    typeXml('<root><a note="say &quot;hi&quot;">1 &lt; 2 &amp; more</a></root>')
    showView('Tree')

    fireEvent.click(await screen.findByRole('button', { name: 'Copy <a> element' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('<a note="say &quot;hi&quot;">1 &lt; 2 &amp; more</a>')
    )
  })

  it('warns that predicates were ignored even when nothing matched', async () => {
    renderTool(XmlTools)
    typeXml('<root><a>1</a></root>')
    showView('XPath')

    fireEvent.change(await screen.findByLabelText('XPath expression'), {
      target: { value: '/root/nosuch[1]' },
    })

    // The warning used to live inside the results list, so the one case where a
    // dropped predicate might explain the outcome never showed it.
    await waitFor(() => expect(screen.getByText('No matches')).toBeInTheDocument())
    expect(screen.getByText(/Predicates are ignored/)).toBeInTheDocument()
  })

  it('explains an invalid document in the inspector instead of showing an empty pane', async () => {
    renderTool(XmlTools)
    typeXml('<root><unclosed></root>')
    showView('Tree')

    const pane = within(screen.getByRole('region', { name: 'Tree view' }))
    await waitFor(() => expect(pane.getByText('Invalid XML')).toBeInTheDocument())
  })

  it('opens a file and saves the current editor content', async () => {
    vi.mocked(saveFileDialog).mockResolvedValue('/tmp/doc.xml')
    renderTool(XmlTools)

    act(() => {
      dispatchToolAction({ type: 'open-file', content: SAMPLE, filename: 'catalog.xml' })
    })
    expect(editor()).toHaveValue(SAMPLE)
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Opened catalog.xml' })

    act(() => dispatchToolAction({ type: 'save-file' }))
    await waitFor(() => expect(saveFileDialog).toHaveBeenCalledWith(SAMPLE, 'catalog.xml'))
  })

  it('does not open a save dialog for an empty buffer', () => {
    renderTool(XmlTools)
    act(() => dispatchToolAction({ type: 'save-file' }))

    expect(saveFileDialog).not.toHaveBeenCalled()
    expect(useUiStore.getState().lastAction).toMatchObject({ message: 'Nothing to save yet' })
  })

  it('offers a sample only while the document is empty', () => {
    renderTool(XmlTools)
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }))

    expect(editor().value).toContain('<catalog>')
    expect(screen.queryByRole('button', { name: 'Load sample' })).not.toBeInTheDocument()
  })
})
