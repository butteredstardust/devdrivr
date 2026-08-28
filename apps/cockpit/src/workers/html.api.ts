import { HTMLHint } from 'htmlhint'
import {
  computeStats,
  sortIssues,
  type HtmlIssue,
  type HtmlStats,
} from '@/tools/html-validator/html-helpers'

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
  return { issues, stats: computeStats(input) }
}
