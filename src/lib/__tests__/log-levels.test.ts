import { describe, expect, it } from 'vitest'
import { filterLog, findLogLevel, indexLog, isFilterActive } from '@/lib/log-levels'

describe('findLogLevel', () => {
  it('finds an upper-case level word and its position', () => {
    expect(findLogLevel('2026-09-27 12:00:00 ERROR disk full')).toEqual({
      level: 'error',
      start: 20,
      end: 25,
    })
    expect(findLogLevel('WARNING: slow query')?.level).toBe('warn')
    expect(findLogLevel('FATAL crash')?.level).toBe('error')
  })

  it('finds a keyed or bracketed level in any case', () => {
    expect(findLogLevel('ts=1 level=warn msg=x')).toMatchObject({
      level: 'warn',
      start: 11,
      end: 15,
    })
    expect(findLogLevel('{"level":"debug","msg":"x"}')?.level).toBe('debug')
    expect(findLogLevel('[info] started')?.level).toBe('info')
  })

  it('ignores a level word in a sentence', () => {
    expect(findLogLevel('no error found')).toBeNull()
    expect(findLogLevel('ERRORS are counted elsewhere')).toBeNull()
  })

  it('takes the first level of the line', () => {
    expect(findLogLevel('INFO retrying after ERROR')?.level).toBe('info')
  })
})

describe('indexLog', () => {
  it('lets a line without a level belong to the level before it', () => {
    const index = indexLog('INFO start\nERROR failed\n  at main.js:1\nWARN slow')
    expect(index.own).toEqual(['info', 'error', null, 'warn'])
    expect(index.effective).toEqual(['info', 'error', 'error', 'warn'])
    expect(index.errorLines).toEqual([1])
    expect(index.warningLines).toEqual([3])
  })

  it('indexes empty text as no lines', () => {
    expect(indexLog('').lines).toEqual([])
  })
})

describe('filterLog', () => {
  const index = indexLog('INFO start\nERROR failed\n  at main.js:1\nWARN slow disk\nINFO done')

  it('keeps the lines that contain the text, in any case, with their line numbers', () => {
    expect(filterLog(index, { query: 'DISK', regex: false, levels: [] })).toEqual({
      ok: true,
      text: 'WARN slow disk',
      lineNumbers: [4],
    })
  })

  it('keeps the lines of the selected levels, with the lines that belong to them', () => {
    expect(filterLog(index, { query: '', regex: false, levels: ['error'] })).toEqual({
      ok: true,
      text: 'ERROR failed\n  at main.js:1',
      lineNumbers: [2, 3],
    })
  })

  it('combines a regex with a level', () => {
    const result = filterLog(index, { query: '^info', regex: true, levels: ['info'] })
    expect(result).toMatchObject({ ok: true, lineNumbers: [1, 5] })
  })

  it('does not keep the empty line after a final line break', () => {
    const trailing = indexLog('ERROR a\n')
    expect(filterLog(trailing, { query: '', regex: false, levels: ['error'] })).toMatchObject({
      text: 'ERROR a',
      lineNumbers: [1],
    })
  })

  it('reports an invalid regex', () => {
    expect(filterLog(index, { query: '(', regex: true, levels: [] })).toMatchObject({ ok: false })
  })

  it('treats an empty query and no levels as no filter', () => {
    expect(isFilterActive({ query: '', regex: true, levels: [] })).toBe(false)
    expect(isFilterActive({ query: '', regex: false, levels: ['warn'] })).toBe(true)
  })
})
