import type { XmlIssue, XmlTreeNode } from '@/workers/xml.api'

export type XmlView = 'source' | 'tree' | 'json' | 'xpath'

export type XmlToolsState = {
  input: string
  fileName: string | null
  filePath: string | null
  /**
   * Tree, JSON, and XPath appear beside the source so users can inspect and edit together. The view
   * choice persists.
   */
  view: XmlView
  xpath: string
  indent: number
}

export type UpdateXmlToolsState = (patch: Partial<XmlToolsState>) => void

/** Above this many elements the tree opens collapsed — expanding is one click. */
export const LARGE_DOCUMENT_ELEMENTS = 300

export const VIEW_OPTIONS = [
  { value: 'source' as const, label: 'Source' },
  { value: 'tree' as const, label: 'Tree' },
  { value: 'json' as const, label: 'JSON' },
  { value: 'xpath' as const, label: 'XPath' },
]

// ---------------------------------------------------------------------------
// Tree model
// ---------------------------------------------------------------------------

/**
 * The parser hands back decoded values, so anything written back into markup has
 * to be re-escaped — otherwise a document containing `&`, `<` or a quoted
 * attribute copies as XML that will not parse again.
 */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

/** The XML a node stands for, so a tree row can be copied straight into an editor. */
export function nodeToXml(node: XmlTreeNode): string {
  if (node.type === 'text') return escapeText(node.value)
  if (node.type === 'comment') return `<!--${node.value}-->`
  if (node.type === 'cdata') return `<![CDATA[${node.value}]]>`
  if (node.type === 'pi') return `<?${node.name} ${node.value}?>`
  const attributes = Object.entries(node.attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join('')
  if (node.children.length === 0) return `<${node.name}${attributes} />`
  return `<${node.name}${attributes}>${node.children.map(nodeToXml).join('')}</${node.name}>`
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The first thing that actually breaks the document, warnings last. */
export function firstBlockingIssue(issues: XmlIssue[]): XmlIssue | undefined {
  return issues.find((issue) => issue.level !== 'warning')
}

export function describeIssue(issue: XmlIssue): string {
  const where =
    issue.line !== undefined
      ? ` — line ${issue.line}${issue.column !== undefined ? `, column ${issue.column}` : ''}`
      : ''
  return `${issue.message}${where}`
}
