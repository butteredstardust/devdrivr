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

type XmlStats = {
  elements: number
  attributes: number
  textNodes: number
  depth: number
}

type JsonResult = {
  valid: boolean
  json?: string
  error?: string
}

const api = {
  validate(xml: string): XmlResult {
    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) } as any)
    parser.parseFromString(xml, 'text/xml')
    return { valid: errors.length === 0, errors }
  },

  format(xml: string, indent: number = 2): XmlResult {
    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) } as any)
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

  minify(xml: string): XmlResult {
    const errors: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) } as any)
    const doc = parser.parseFromString(xml, 'text/xml')
    if (errors.length > 0) {
      return { valid: false, errors }
    }
    const serializer = new XMLSerializer()
    const raw = serializer.serializeToString(doc)
    // Strip whitespace between tags
    const minified = raw.replace(/>\s+</g, '><').trim()
    return { valid: true, errors: [], formatted: minified }
  },

  toJson(xml: string): JsonResult {
    try {
      const errors: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) } as any)
      const doc = parser.parseFromString(xml, 'text/xml')
      if (errors.length > 0) {
        return { valid: false, error: errors.join('\n') }
      }
      const json = nodeToJson(doc.documentElement)
      return { valid: true, json: JSON.stringify(json, null, 2) }
    } catch (e) {
      return { valid: false, error: (e as Error).message }
    }
  },

  stats(xml: string): XmlStats {
    try {
      const errors: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) } as any)
      const doc = parser.parseFromString(xml, 'text/xml')
      if (errors.length > 0) return { elements: 0, attributes: 0, textNodes: 0, depth: 0 }
      return collectStats(doc.documentElement)
    } catch {
      return { elements: 0, attributes: 0, textNodes: 0, depth: 0 }
    }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeToJson(node: any): any {
  if (!node) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = {}

  // Attributes
  if (node.attributes && node.attributes.length > 0) {
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes.item(i)
      if (attr) obj[`@${attr.name}`] = attr.value
    }
  }

  // Child nodes
  const children = node.childNodes
  if (children && children.length > 0) {
    const textParts: string[] = []
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i)
      if (!child) continue
      // Text node (nodeType 3) or CDATA (nodeType 4)
      if (child.nodeType === 3 || child.nodeType === 4) {
        const txt = (child.textContent ?? '').trim()
        if (txt) textParts.push(txt)
      } else if (child.nodeType === 1 && child.tagName) {
        const tag = child.tagName
        const value = nodeToJson(child)
        if (obj[tag] !== undefined) {
          if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]]
          obj[tag].push(value)
        } else {
          obj[tag] = value
        }
      }
    }
    if (textParts.length > 0 && Object.keys(obj).filter((k) => !k.startsWith('@')).length === 0) {
      // Leaf element — if only text content and possibly attributes
      const text = textParts.join('')
      if (Object.keys(obj).length === 0) return text
      obj['#text'] = text
    }
  }

  return Object.keys(obj).length === 0 ? '' : obj
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectStats(node: any, depth = 0): { elements: number; attributes: number; textNodes: number; depth: number } {
  let elements = 0
  let attributes = 0
  let textNodes = 0
  let maxDepth = depth

  if (!node) return { elements, attributes, textNodes, depth: maxDepth }

  if (node.nodeType === 1) {
    elements++
    if (node.attributes) attributes += node.attributes.length
  }
  if ((node.nodeType === 3 || node.nodeType === 4) && (node.textContent ?? '').trim()) {
    textNodes++
  }

  if (node.childNodes) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes.item(i)
      const childStats = collectStats(child, depth + (node.nodeType === 1 ? 1 : 0))
      elements += childStats.elements
      attributes += childStats.attributes
      textNodes += childStats.textNodes
      maxDepth = Math.max(maxDepth, childStats.depth)
    }
  }

  return { elements, attributes, textNodes, depth: maxDepth }
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
