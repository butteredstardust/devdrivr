import { handleRpc } from './rpc'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

type XmlResult = {
  valid: boolean
  errors: string[]
  formatted?: string
}

type XPathResult = {
  matches: string[]
  count: number
}

function makeErrorHandler(errors: string[]) {
  return (level: 'warning' | 'error' | 'fatalError', msg: string) => {
    const prefix = level === 'warning' ? 'Warning' : level === 'error' ? 'Error' : 'Fatal'
    errors.push(`${prefix}: ${msg}`)
  }
}

const api = {
  validate(xml: string): XmlResult {
    const errors: string[] = []
    const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) })
    parser.parseFromString(xml, 'text/xml')
    return { valid: errors.length === 0, errors }
  },

  format(xml: string, indent: number = 2): XmlResult {
    const errors: string[] = []
    const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) })
    const doc = parser.parseFromString(xml, 'text/xml')
    if (errors.length > 0) {
      return { valid: false, errors }
    }

    // Simple indentation-based formatting
    const serializer = new XMLSerializer()
    const raw = serializer.serializeToString(doc)
    const formatted = formatXmlString(raw, indent)
    return { valid: true, errors: [], formatted }
  },

  queryXPath(xml: string, expression: string): XPathResult {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, 'text/xml')
      const serializer = new XMLSerializer()
      const results: string[] = []

      const nodes = evaluateSimpleXPath(doc, expression)
      for (const node of nodes) {
        results.push(serializer.serializeToString(node))
      }

      return { matches: results, count: results.length }
    } catch (e) {
      return { matches: [(e as Error).message], count: 0 }
    }
  },
}

function formatXmlString(xml: string, indent: number): string {
  const pad = ' '.repeat(indent)
  let formatted = ''
  let depth = 0
  const lines = xml.replace(/(>)(<)/g, '$1\n$2').split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('</')) depth--
    formatted += pad.repeat(Math.max(0, depth)) + trimmed + '\n'
    if (
      trimmed.startsWith('<') &&
      !trimmed.startsWith('</') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>') &&
      !trimmed.includes('</')
    ) {
      depth++
    }
  }
  return formatted.trimEnd()
}

// Use `any` types for xmldom nodes since they don't match the DOM lib types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evaluateSimpleXPath(doc: any, expression: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []
  try {
    const parts = expression.replace(/^\/\//, '/').split('/').filter(Boolean)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nodes: any[] = [doc.documentElement]

    for (const part of parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next: any[] = []
      const tagName = part.replace(/\[.*\]/, '')
      for (const node of nodes) {
        if (node.childNodes) {
          for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes.item(i)
            if (child && child.tagName === tagName) {
              next.push(child)
            }
          }
        }
      }
      nodes = next
    }
    return nodes
  } catch {
    return results
  }
}

export type XmlWorker = typeof api

handleRpc(api)
