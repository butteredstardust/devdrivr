import type { Element, Node } from '@xmldom/xmldom'

type XPathAxis = 'child' | 'descendant'

type XPathSegment = {
  axis: XPathAxis
  tagName: string
}

function parseSimpleXPathExpression(expression: string): XPathSegment[] {
  const normalized = expression.trim()
  if (!normalized) return []

  const source = normalized.startsWith('/') ? normalized : `/${normalized}`
  const segments: XPathSegment[] = []
  const matcher = /(\/\/|\/)([^/]+)/g

  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    const rawTag = match[2]?.trim().replace(/\[.*\]$/, '')
    if (!rawTag) continue
    segments.push({
      axis: match[1] === '//' ? 'descendant' : 'child',
      tagName: rawTag,
    })
  }

  return segments
}

function isElementNode(node: Node | null | undefined): node is Element {
  return Boolean(node && node.nodeType === 1)
}

function collectDescendantMatches(node: Node, tagName: string, results: Node[]) {
  if (!node.childNodes) return

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes.item(i)
    if (!isElementNode(child)) continue
    if (child.tagName === tagName) results.push(child)
    collectDescendantMatches(child, tagName, results)
  }
}

export function evaluateSimpleXPath(
  doc: { documentElement: Element | null },
  expression: string
): Node[] {
  const root = doc.documentElement
  if (!root) return []

  const segments = parseSimpleXPathExpression(expression)
  if (segments.length === 0) return []

  let current: Node[] = [root]

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (!segment) return []

    const next: Node[] = []

    for (const node of current) {
      if (!isElementNode(node)) continue

      if (segment.axis === 'child') {
        if (index === 0 && node === root && node.tagName === segment.tagName) {
          next.push(node)
          continue
        }

        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes.item(i)
          if (isElementNode(child) && child.tagName === segment.tagName) {
            next.push(child)
          }
        }
        continue
      }

      if (node.tagName === segment.tagName) {
        next.push(node)
      }
      collectDescendantMatches(node, segment.tagName, next)
    }

    current = next
  }

  return current
}
