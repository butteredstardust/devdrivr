import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import rehypeHighlight from 'rehype-highlight'

export async function processMarkdown(content: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeSanitize, {
      tagNames: [
        'span',
        'pre',
        'code',
        'p',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'blockquote',
        'a',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'br',
        'hr',
      ],
      attributes: {
        '*': ['className', 'class'],
        a: ['href', 'target', 'rel'],
      },
    })
    .use(rehypeStringify)
    .process(content)

  return String(file)
}
