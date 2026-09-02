/**
 * Pure XML processing logic shared by the xml worker and its test-environment
 * mock. Lives in its own module (no `self` reference) so it can run
 * identically on the worker thread and in-process under Vitest.
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Node, Element } from '@xmldom/xmldom'
import xpath from 'xpath'

/** Levels come straight from xmldom: only `warning` still leaves a usable document. */
export type XmlIssueLevel = 'warning' | 'error' | 'fatalError'

export type XmlIssue = {
  level: XmlIssueLevel
  message: string
  line?: number
  column?: number
}

export type XmlResult = {
  valid: boolean
  issues: XmlIssue[]
  formatted?: string
}

export type XPathResult = {
  matches: string[]
  count: number
  /** Set when the expression itself is the problem, so the UI never shows an error as a match. */
  error?: string
  /** Kept for compatibility with the UI; real XPath evaluation no longer ignores predicates. */
  predicatesIgnored?: boolean
}

export type XmlStats = {
  elements: number
  attributes: number
  textNodes: number
  depth: number
}

export type XmlInspection = {
  valid: boolean
  issues: XmlIssue[]
  stats: XmlStats
}

/** The shape the Tree pane renders. Built here so it agrees with validation. */
export type XmlTreeNode =
  | { type: 'element'; name: string; attributes: Record<string, string>; children: XmlTreeNode[] }
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }
  | { type: 'cdata'; value: string }
  | { type: 'pi'; name: string; value: string }

export type JsonResult = {
  valid: boolean
  json?: string
  xml?: string
  rootName?: string
  error?: string
}

// Use xmldom's Node types. The library's Node interface doesn't match the DOM
// lib types exactly, so we use it directly from the import above.

type Located = { locator?: { lineNumber?: number; columnNumber?: number } }

const EMPTY_STATS: XmlStats = { elements: 0, attributes: 0, textNodes: 0, depth: 0 }

/**
 * Parses once and collects every issue with its location.
 *
 * xmldom reports recoverable problems through `onError` and aborts fatal ones by
 * throwing a `ParseError`; both carry a locator, and without it the UI can only
 * say "invalid" and leave the user to find the offending line themselves.
 */
function parseXml(xml: string): {
  doc: ReturnType<DOMParser['parseFromString']> | null
  issues: XmlIssue[]
} {
  const issues: XmlIssue[] = []
  const parser = new DOMParser({
    onError: (level, message, context) => {
      const locator = (context as Located | undefined)?.locator
      issues.push({
        level: level,
        message,
        ...(locator?.lineNumber !== undefined ? { line: locator.lineNumber } : {}),
        ...(locator?.columnNumber !== undefined ? { column: locator.columnNumber } : {}),
      })
    },
  })
  try {
    return { doc: parser.parseFromString(xml, 'text/xml'), issues }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A fatal error reaches `onError` first and is then thrown: only add it when
    // the throw is all we got.
    if (!issues.some((issue) => issue.message === message)) {
      const locator = (e as Located).locator
      issues.push({
        level: 'fatalError',
        message,
        ...(locator?.lineNumber !== undefined ? { line: locator.lineNumber } : {}),
        ...(locator?.columnNumber !== undefined ? { column: locator.columnNumber } : {}),
      })
    }
    return { doc: null, issues }
  }
}

/** Warnings (a missing attribute quote, say) still produce a document worth showing. */
function isUsable(issues: XmlIssue[]): boolean {
  return !issues.some((issue) => issue.level !== 'warning')
}

export function validate(xml: string): XmlResult {
  const { issues } = parseXml(xml)
  return { valid: isUsable(issues), issues }
}

export function format(xml: string, indent: number = 2): XmlResult {
  const { doc, issues } = parseXml(xml)
  if (!doc || !isUsable(issues)) return { valid: false, issues }
  const serializer = new XMLSerializer()
  const formatted = formatXmlString(serializer.serializeToString(doc), indent)
  return { valid: true, issues, formatted }
}

export function minify(xml: string): XmlResult {
  const { doc, issues } = parseXml(xml)
  if (!doc || !isUsable(issues)) return { valid: false, issues }
  const serializer = new XMLSerializer()
  const minified = serializer.serializeToString(doc).replace(/>\s+</g, '><').trim()
  return { valid: true, issues, formatted: minified }
}

/** One parse for the whole status line: validity, issues and document shape. */
export function inspect(xml: string): XmlInspection {
  const { doc, issues } = parseXml(xml)
  const valid = isUsable(issues)
  return { valid, issues, stats: doc && valid ? collectStats(doc.documentElement) : EMPTY_STATS }
}

export function toJson(xml: string): JsonResult {
  const { doc, issues } = parseXml(xml)
  if (!doc || !isUsable(issues)) {
    return { valid: false, error: issues.map((issue) => issue.message).join('\n') || 'Invalid XML' }
  }
  try {
    const root = doc.documentElement
    if (!root) return { valid: false, error: 'XML document has no root element' }
    if (containsMixedContent(root)) {
      return {
        valid: false,
        error:
          'Cannot convert mixed-content XML to JSON without losing text order. Remove interleaved text or keep this document as XML.',
      }
    }
    return {
      valid: true,
      json: JSON.stringify(nodeToJson(root), null, 2),
      rootName: root.tagName,
    }
  } catch (e) {
    return { valid: false, error: (e as Error).message }
  }
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, '&quot;')
}

const XML_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/

function assertXmlName(name: string, kind: 'element' | 'attribute'): void {
  if (!XML_NAME.test(name)) throw new Error(`Invalid XML ${kind} name: ${name}`)
}

function jsonToXmlElement(name: string, value: unknown): string {
  assertXmlName(name, 'element')
  if (Array.isArray(value)) return value.map((item) => jsonToXmlElement(name, item)).join('')
  if (value === null || value === undefined) return `<${name} />`
  if (typeof value !== 'object') return `<${name}>${escapeXmlText(String(value))}</${name}>`

  const object = value as Record<string, unknown>
  const attributes = Object.entries(object)
    .filter(([key, item]) => key.startsWith('@') && item !== null && item !== undefined)
    .map(([key, item]) => {
      const attribute = key.slice(1)
      assertXmlName(attribute, 'attribute')
      return ` ${attribute}="${escapeXmlAttribute(String(item))}"`
    })
    .join('')
  const text = object['#text']
  const children = Object.entries(object)
    .filter(([key]) => !key.startsWith('@') && key !== '#text')
    .map(([key, item]) => jsonToXmlElement(key, item))
    .join('')
  const content = `${text === undefined ? '' : escapeXmlText(String(text))}${children}`
  return content ? `<${name}${attributes}>${content}</${name}>` : `<${name}${attributes} />`
}

/** Rebuilds XML using the same @attribute/#text convention emitted by toJson. */
export function fromJson(json: string, rootName = 'root'): JsonResult {
  try {
    const value: unknown = JSON.parse(json)
    const name = rootName.trim() || 'root'
    assertXmlName(name, 'element')
    const xml = Array.isArray(value)
      ? `<${name}>${value.map((item) => jsonToXmlElement('item', item)).join('')}</${name}>`
      : jsonToXmlElement(name, value)
    return { valid: true, xml }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * The document as a tree of plain objects.
 *
 * It used to be built on the main thread with the browser `DOMParser`, which
 * meant a second parse with a second set of rules — and no tree at all wherever
 * that global is absent. One parser, one verdict.
 */
export function tree(xml: string): XmlTreeNode | null {
  const { doc, issues } = parseXml(xml)
  if (!doc || !isUsable(issues)) return null
  return nodeToTree(doc.documentElement)
}

function nodeToTree(node: Node | null): XmlTreeNode | null {
  if (!node) return null
  if (node.nodeType === 1) {
    const el = node as Element
    const attributes: Record<string, string> = {}
    for (let i = 0; i < el.attributes.length; i++) {
      const attribute = el.attributes.item(i)
      if (attribute) attributes[attribute.name] = attribute.value
    }
    const children: XmlTreeNode[] = []
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = nodeToTree(el.childNodes.item(i))
      if (child) children.push(child)
    }
    return { type: 'element', name: el.tagName, attributes, children }
  }
  if (node.nodeType === 3) {
    const text = (node.textContent ?? '').trim()
    return text ? { type: 'text', value: text } : null
  }
  if (node.nodeType === 8) return { type: 'comment', value: node.textContent ?? '' }
  if (node.nodeType === 4) return { type: 'cdata', value: node.textContent ?? '' }
  if (node.nodeType === 7) return { type: 'pi', name: node.nodeName, value: node.textContent ?? '' }
  return null
}

export function stats(xml: string): XmlStats {
  return inspect(xml).stats
}

export function queryXPath(xml: string, expression: string): XPathResult {
  const { doc, issues } = parseXml(xml)
  if (!doc || !isUsable(issues)) {
    return { matches: [], count: 0, error: 'Fix the XML before running a query.' }
  }
  try {
    const serializer = new XMLSerializer()
    const selected = xpath.select(expression, doc as unknown as globalThis.Node)
    const values = Array.isArray(selected) ? selected : [selected]
    const matches = values.map((value) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
      }
      return serializer.serializeToString(value as unknown as Node)
    })
    // The error used to be returned *as a match*, so a broken expression looked
    // like a result with a count of zero next to it.
    return { matches, count: matches.length, predicatesIgnored: false }
  } catch (e) {
    return { matches: [], count: 0, error: (e as Error).message }
  }
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

/** JSON object keys cannot preserve the ordering of text interleaved with child elements. */
function containsMixedContent(node: Element): boolean {
  let hasMeaningfulText = false
  let hasElement = false
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes.item(i)
    if (!child) continue
    if (child.nodeType === 3 || child.nodeType === 4) {
      if ((child.textContent ?? '').trim().length > 0) hasMeaningfulText = true
    } else if (child.nodeType === 1) {
      hasElement = true
      if (containsMixedContent(child as Element)) return true
    }
  }
  return hasMeaningfulText && hasElement
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
