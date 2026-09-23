import { describe, expect, it } from 'vitest'
import cases from '../../../shared/wiki-link-cases.json'
import { parseWikiLinks } from '@/lib/wiki-links'

describe('shared wiki-link contract', () => {
  it.each(cases)('$name', ({ content, targets }) => {
    const uniqueTargets = new Map(
      parseWikiLinks(content).map((link) => [`${link.kind}:${link.id}`, [link.kind, link.id]])
    )
    expect([...uniqueTargets.values()]).toEqual(targets)
  })
})
