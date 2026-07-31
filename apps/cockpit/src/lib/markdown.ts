import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'

/**
 * Shared sanitize schema for all markdown rendering surfaces (Notes drawer,
 * Markdown Editor). Extends rehype-sanitize's `defaultSchema` rather than
 * replacing it, so GFM tables/images/task-list checkboxes survive while
 * `javascript:`/`data:` hrefs are still stripped by the defaults.
 */
export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'target', 'rel'],
    // Only allow rehype-highlight's own class naming scheme, not arbitrary strings.
    // hast-util-sanitize's `findDefinition` uses the *first* matching entry for a
    // given property name, so this tuple must come before the spread of
    // `defaultSchema.attributes.code` (which also defines `className`) or it will
    // never be consulted.
    code: [
      ['className', /^hljs-/, /^language-/, 'hljs'] as [string, ...Array<string | RegExp>],
      ...(defaultSchema.attributes?.['code'] ?? []),
    ],
    span: [
      ['className', /^hljs-/, /^language-/, 'hljs'] as [string, ...Array<string | RegExp>],
      ...(defaultSchema.attributes?.['span'] ?? []),
    ],
    // `input` is only ever emitted for GFM task-list checkboxes. `type`/`disabled`
    // are listed explicitly (and first, for the same first-match reason as above)
    // so the restriction holds even if `defaultSchema`'s own input handling changes.
    input: [
      ['type', 'checkbox'] as [string, ...Array<string | boolean>],
      ['disabled', true] as [string, ...Array<string | boolean>],
      ...(defaultSchema.attributes?.['input'] ?? []),
      'checked',
    ],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'input'],
}

export async function processMarkdown(content: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeSanitize, markdownSanitizeSchema)
    .use(rehypeStringify)
    .process(content)

  return String(file)
}
