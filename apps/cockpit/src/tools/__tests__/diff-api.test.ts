import { describe, expect, it } from 'vitest'
import { computeDiff } from '@/workers/diff.api'

describe('diff api', () => {
  it('normalizes case when requested', () => {
    expect(computeDiff('Hello', 'hello', { ignoreCase: true })).not.toContain('-Hello')
    expect(computeDiff('Hello', 'hello')).toContain('-Hello')
  })
})
