import { describe, expect, it } from 'vitest'
import {
  DOWNLOAD_LINE,
  END_MARKER,
  START_MARKER,
  composeReleaseBody,
  extractReleaseNotes,
} from '../release-notes.mjs'

const extract = extractReleaseNotes as (body: string | null) => string
const compose = composeReleaseBody as (notes: string) => string

describe('release notes from a PR body', () => {
  it('takes the text between the markers, headings included', () => {
    const body = [
      '## Summary',
      '- internal detail',
      '',
      '## Release notes',
      START_MARKER,
      '## What’s fixed',
      '',
      '### Notes',
      '',
      '- **Restore works.** A restored note returns to its folder.',
      END_MARKER,
      '',
      '## Test plan',
      '- [x] tests',
    ].join('\n')

    expect(extract(body)).toBe(
      '## What’s fixed\n\n### Notes\n\n- **Restore works.** A restored note returns to its folder.'
    )
  })

  it('reads a CRLF body', () => {
    expect(extract(`${START_MARKER}\r\n### Fixed\r\n- One\r\n${END_MARKER}`)).toBe(
      '### Fixed\n- One'
    )
  })

  it('returns nothing without both markers', () => {
    expect(extract('## Summary\n- change')).toBe('')
    expect(extract(`${START_MARKER}\n### Fixed`)).toBe('')
    expect(extract(null)).toBe('')
  })

  it('ends the body with the download line exactly once', () => {
    expect(compose('### Fixed\n- One')).toBe(`### Fixed\n- One\n\n${DOWNLOAD_LINE}\n`)
    expect(compose(`### Fixed\n- One\n\n${DOWNLOAD_LINE}`)).toBe(
      `### Fixed\n- One\n\n${DOWNLOAD_LINE}\n`
    )
    expect(compose('   ')).toBe('')
  })
})
