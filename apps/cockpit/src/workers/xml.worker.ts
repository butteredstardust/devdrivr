import { handleRpc } from './rpc'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Node, Element } from '@xmldom/xmldom'

type XmlResult = {
  valid: boolean
  errors: string[]
  formatted?: string
}

type XPathResult = {
  matches: string[]
  count: number
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

// Use xmldom's Node types. The library's Node interface doesn't match the DOM
// lib types exactly, so we use it directly from the import above.

function makeParser(errors: string[]): DOMParser {
  return new DOMParser({
    onError: (_level, msg) => errors.push(msg),
  })
}

const api = {
  validate(xml: string): XmlResult {
    try {
      const errors: string[] = []
      const parser = makeParser(errors)
      parser.parseFromString(xml, 'text/xml')
      return { valid: errors.length === 0, errors }
    } catch (e) {
      return { valid: false, errors: [(e as Error).message] }
    }
  },

  format(xml: string, indent: number = 2): XmlResult {
    try {
      const errors: string[] = []
      const parser = makeParser(errors)
      const doc = parser.parseFromString(xml, 'text/xml')
      if (errors.length > 0) {
        return { valid: false, errors }
      }

      // Simple indentation-based formatting
      const serializer = new XMLSerializer()
      const raw = serializer.serializeToString(doc)
      const formatted = formatXmlString(raw, indent)
      return { valid: true, errors: [], formatted }
    } catch (e) {
      return { valid: false, errors: [(e as Error).message] }
    }
  },

  minify(xml: string): XmlResult {
    try {
      const errors: string[] = []
      const parser = makeParser(errors)
      const doc = parser.parseFromString(xml, 'text/xml')
      if (errors.length > 0) {
        return { valid: false, errors }
      }
      const serializer = new XMLSerializer()
      const raw = serializer.serializeToString(doc)
      // Strip whitespace between tags
      const minified = raw.replace(/>\s+</g, '><').trim()
      return { valid: true, errors: [], formatted: minified }
    } catch (e) {
      return { valid: false, errors: [(e as Error).message] }
    }
  },

  toJson(xml: string): JsonResult {
    try {
      const errors: string[] = []
      const parser = makeParser(errors)
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
      const parser = makeParser(errors)
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

function nodeToJson(node: Element | Node | null): unknown {
  if (!node) return null
  const obj: Record<string, unknown> = {}

  // Attributes
  const el = node as Element
  if (el.attributes && el.attributes.length > 0) {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes.item(i)
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
      } else if (child.nodeType === 1) {
        const childEl = child as Element
        if (childEl.tagName) {
          const tag = childEl.tagName
          const value = nodeToJson(childEl)
          if (obj[tag] !== undefined) {
            if (!Array.isArray(obj[tag])) obj[tag] = [obj[tag]]
            ;(obj[tag] as unknown[]).push(value)
          } else {
            obj[tag] = value
          }
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

function collectStats(
  node: Node | null,
  depth = 0
): { elements: number; attributes: number; textNodes: number; depth: number } {
  let elements = 0
  let attributes = 0
  let textNodes = 0
  let maxDepth = depth

  if (!node) return { elements, attributes, textNodes, depth: maxDepth }

  if (node.nodeType === 1) {
    elements++
    const el = node as Element
    if (el.attributes) attributes += el.attributes.length
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

// Use xmldom nodes since they don't match the DOM lib types exactly
function evaluateSimpleXPath(
  doc: ReturnType<DOMParser['parseFromString']>,
  expression: string
): Node[] {
  const results: Node[] = []
  try {
    const parts = expression.replace(/^\/\//, '/').split('/').filter(Boolean)
    const root = doc.documentElement
    if (!root) return results
    let nodes: Node[] = [root]

    for (const part of parts) {
      const next: Node[] = []
      const tagName = part.replace(/\[.*\]/, '')
      for (const node of nodes) {
        if (node.childNodes) {
          for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes.item(i)
            if (child) {
              const childEl = child as Element
              if (childEl.tagName === tagName) {
                next.push(child)
              }
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
