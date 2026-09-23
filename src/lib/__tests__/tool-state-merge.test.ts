import { describe, expect, it } from 'vitest'
import { droppedToolStateKeys, mergeToolState } from '@/lib/tool-state-merge'

describe('mergeToolState', () => {
  it('keeps saved values when every runtime kind matches', () => {
    const defaults = {
      text: '',
      count: 0,
      enabled: false,
      items: [] as string[],
      options: {} as Record<string, unknown>,
    }
    const saved = {
      text: 'saved',
      count: 4,
      enabled: true,
      items: ['one'],
      options: { compact: true },
    }

    expect(mergeToolState(defaults, saved)).toEqual(saved)
  })

  it('uses defaults for saved values with different runtime kinds', () => {
    const defaults = {
      text: 'default',
      count: 2,
      enabled: false,
      items: [] as string[],
      options: { compact: false },
    }

    expect(
      mergeToolState(defaults, {
        text: 1,
        count: '2',
        enabled: 0,
        items: {},
        options: [],
      })
    ).toEqual(defaults)
  })

  it('accepts any JSON value when the default is null', () => {
    const defaults = { selection: null as unknown }

    expect(mergeToolState(defaults, { selection: ['saved', { id: 1 }] })).toEqual({
      selection: ['saved', { id: 1 }],
    })
  })

  it('drops saved keys that do not exist in defaults', () => {
    expect(mergeToolState({ input: '' }, { input: 'saved', removed: true })).toEqual({
      input: 'saved',
    })
    expect(droppedToolStateKeys({ input: '' }, { input: 'saved', removed: true })).toEqual([
      'removed',
    ])
  })

  it('returns defaults for a non-object saved value', () => {
    const defaults = { input: 'default' }

    expect(mergeToolState(defaults, 'saved')).toBe(defaults)
    expect(mergeToolState(defaults, null)).toBe(defaults)
  })

  it('rejects non-finite saved numbers', () => {
    const defaults = { count: 3 }

    expect(mergeToolState(defaults, { count: Number.NaN })).toEqual(defaults)
    expect(droppedToolStateKeys(defaults, { count: Number.NaN })).toEqual(['count'])
  })
})
