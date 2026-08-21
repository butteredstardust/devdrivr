import { HTMLHint } from 'htmlhint'
import { parse } from 'parse5'
import {
  sortIssues,
  type Heading,
  type HtmlIssue,
  type HtmlStats,
} from '@/tools/html-validator/html-helpers'

type HtmlNode = {
  nodeName: string
  tagName?: string
  value?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: HtmlNode[]
  sourceCodeLocation?: { startLine: number; startCol: number } | null
}

function computeHtmlStats(input: string): HtmlStats {
  const document = parse(input, { sourceCodeLocationInfo: true }) as unknown as HtmlNode
  const implied = new Set(
    ['html', 'head', 'body'].filter((tag) => !new RegExp(`<${tag}[\\s>]`, 'i').test(input))
  )
  let elements = 0
  let depth = 0
  let styleAttributes = 0
  let scripts = 0
  const headings: Heading[] = []

  const textOf = (node: HtmlNode): string =>
    node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(textOf).join('')

  const walk = (node: HtmlNode, parentDepth: number) => {
    const tag = node.tagName?.toLowerCase()
    const isElement = tag !== undefined
    const currentDepth = isElement && !implied.has(tag) ? parentDepth + 1 : parentDepth
    if (isElement && !implied.has(tag)) {
      elements += 1
      depth = Math.max(depth, currentDepth)
      if (node.attrs?.some((attribute) => attribute.name === 'style')) styleAttributes += 1
      if (tag === 'script') scripts += 1
      if (/^h[1-6]$/.test(tag)) {
        headings.push({
          level: Number(tag.slice(1)),
          text: textOf(node).replace(/\s+/g, ' ').trim(),
          line: node.sourceCodeLocation?.startLine ?? 1,
          column: node.sourceCodeLocation?.startCol ?? 1,
        })
      }
    }
    for (const child of node.childNodes ?? []) walk(child, currentDepth)
  }
  walk(document, 0)
  return { elements, depth, styleAttributes, scripts, headings }
}

export function validateHtml(
  input: string,
  ruleset: Record<string, unknown>
): { issues: HtmlIssue[]; stats: HtmlStats } {
  const issues = sortIssues(
    HTMLHint.verify(input, ruleset as Parameters<typeof HTMLHint.verify>[1]).map((result) => ({
      message: result.message,
      line: result.line,
      col: result.col,
      type: result.type === 'error' ? ('error' as const) : ('warning' as const),
      rule: result.rule.id,
    }))
  )
  return { issues, stats: computeHtmlStats(input) }
}
