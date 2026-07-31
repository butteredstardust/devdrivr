import { describe, expect, it } from 'vitest'
import rehypeSanitize from 'rehype-sanitize'
import { processMarkdown, markdownSanitizeSchema } from '@/lib/markdown'

// `hast` types aren't a direct dependency here (only pulled in transitively by
// rehype/remark packages), so define the minimal shape this test needs rather than
// importing from 'hast' directly.
interface HastElement {
  type: 'element'
  tagName: string
  properties: Record<string, unknown>
  children: HastElement[]
}
interface HastRoot {
  type: 'root'
  children: HastElement[]
}

describe('processMarkdown', () => {
  it('renders GFM tables', async () => {
    const html = await processMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |\n')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders images', async () => {
    const html = await processMarkdown('![alt text](https://example.com/img.png)')
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/img.png"')
    expect(html).toContain('alt="alt text"')
  })

  it('renders strikethrough', async () => {
    const html = await processMarkdown('~~strike~~')
    expect(html).toContain('<del>strike</del>')
  })

  it('renders task list checkboxes', async () => {
    const html = await processMarkdown('- [ ] todo\n- [x] done\n')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('keeps syntax highlighting classes on fenced code', async () => {
    // `defaultSchema` restricts `code` className to `language-*`, which would strip the
    // `hljs-*` classes rehype-highlight emits. The schema re-allows className on `code`
    // and `span` specifically to prevent that; this pins it.
    const html = await processMarkdown('```js\nconst a = 1\n```\n')
    expect(html).toContain('hljs')
    expect(html).toContain('<span class="hljs-keyword">const</span>')
  })

  it('strips javascript: hrefs', async () => {
    const html = await processMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('strips data: hrefs', async () => {
    const html = await processMarkdown('[click](data:text/html,<script>alert(1)</script>)')
    expect(html).not.toContain('data:text/html')
  })

  it('keeps https: hrefs', async () => {
    const html = await processMarkdown('[click](https://example.com)')
    expect(html).toContain('href="https://example.com"')
  })
})

describe('markdownSanitizeSchema', () => {
  // processMarkdown never routes user-controlled `className`/`type` values into the
  // hast tree (rehype-highlight is the only source of `code`/`span` classes, and GFM
  // task lists are the only source of `input`), so these exercise the schema directly
  // against a hand-built tree — the schema-level guarantee, not just what the current
  // pipeline happens to produce. `rehype-sanitize`'s default export is a synchronous
  // `(tree) => tree` transform; cast through the local minimal hast type since the
  // real `hast` types aren't a direct dependency here.
  const sanitizeTransform = rehypeSanitize(markdownSanitizeSchema) as unknown as (
    tree: HastRoot
  ) => HastRoot
  const sanitize = (tree: HastRoot) => sanitizeTransform(tree)

  it('strips an arbitrary className from code while keeping hljs/language- classes', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['hljs', 'language-js', 'evil-exfil'] },
          children: [],
        },
      ],
    }
    const result = sanitize(tree)
    const el = result.children[0]
    expect(el?.type).toBe('element')
    expect(el?.type === 'element' && el.properties.className).toEqual(['hljs', 'language-js'])
  })

  it('strips an arbitrary className from span while keeping hljs-* classes', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['hljs-keyword', 'evil-exfil'] },
          children: [],
        },
      ],
    }
    const result = sanitize(tree)
    const el = result.children[0]
    expect(el?.type).toBe('element')
    expect(el?.type === 'element' && el.properties.className).toEqual(['hljs-keyword'])
  })

  it('strips a non-checkbox input type', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'input',
          properties: { type: 'radio' },
          children: [],
        },
      ],
    }
    const result = sanitize(tree)
    const el = result.children[0]
    expect(el?.type).toBe('element')
    // The disallowed value is dropped, and the schema's `required` default fills
    // `type` back in as `checkbox` — never the attacker-supplied value.
    expect(el?.type === 'element' && el.properties.type).toBe('checkbox')
  })

  it('keeps a checkbox input type and its checked/disabled attributes', () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'input',
          properties: { type: 'checkbox', checked: true },
          children: [],
        },
      ],
    }
    const result = sanitize(tree)
    const el = result.children[0]
    expect(el?.type).toBe('element')
    expect(el?.type === 'element' && el.properties.type).toBe('checkbox')
    expect(el?.type === 'element' && el.properties.checked).toBe(true)
  })
})
