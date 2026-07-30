import { describe, expect, it } from 'vitest'
import { processMarkdown } from '@/lib/markdown'

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
