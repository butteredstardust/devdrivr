import { describe, expect, it } from 'vitest'
import { computeDiff } from '@/workers/diff.api'

describe('diff api', () => {
  it('normalizes case when requested', () => {
    expect(computeDiff('Hello', 'hello', { ignoreCase: true })).not.toContain('-Hello')
    expect(computeDiff('Hello', 'hello')).toContain('-Hello')
  })

  it('distinguishes large JSON integers in JSON mode', () => {
    const patch = computeDiff('{"id":12345678901234567890}', '{"id":12345678901234567891}', {
      jsonMode: true,
    })

    expect(patch).toContain('-  "id": 12345678901234567890')
    expect(patch).toContain('+  "id": 12345678901234567891')
  })
})
