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
    code: [...(defaultSchema.attributes?.['code'] ?? []), 'className'],
    span: [...(defaultSchema.attributes?.['span'] ?? []), 'className'],
    input: [...(defaultSchema.attributes?.['input'] ?? []), 'type', 'checked', 'disabled'],
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
