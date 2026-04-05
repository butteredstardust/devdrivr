import { describe, it, expect } from 'vitest'
import {
  detectDelimiter,
  inferColumnType,
  buildMetadata,
  stripMetadata,
  isDateString,
} from '../csv-tools/utils'

describe('csv-utils', () => {
  describe('detectDelimiter', () => {
    it('detects comma delimiter', () => {
      expect(detectDelimiter('name,age\nAlice,30')).toBe(',')
    })

    it('detects tab delimiter', () => {
      expect(detectDelimiter('name\tage\nAlice\t30')).toBe('\t')
    })

    it('detects pipe delimiter', () => {
      expect(detectDelimiter('name|age\nAlice|30')).toBe('|')
    })

    it('detects semicolon delimiter', () => {
      expect(detectDelimiter('name;age\nAlice;30')).toBe(';')
    })

    it('returns comma for ambiguous input', () => {
      expect(detectDelimiter('onevalue')).toBe(',')
    })
  })

  describe('isDateString', () => {
    it('recognizes ISO date strings', () => {
      expect(isDateString('2024-01-15')).toBe(true)
      expect(isDateString('2024-01-15T10:30:00Z')).toBe(true)
    })

    it('recognizes common date formats', () => {
      expect(isDateString('01/15/2024')).toBe(true)
      expect(isDateString('Jan 15, 2024')).toBe(true)
    })

    it('returns false for non-dates', () => {
      expect(isDateString('not-a-date')).toBe(false)
      expect(isDateString('12345')).toBe(false)
    })
  })

  describe('inferColumnType', () => {
    it('infers number type when 90%+ values are numbers', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      expect(inferColumnType(values)).toBe('number')
    })

    it('infers date type when 90%+ values are dates', () => {
      const values = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
      expect(inferColumnType(values)).toBe('date')
    })

    it('infers mixed type for mixed content', () => {
      const values = ['Alice', 'Bob', 'Charlie', 42, null]
      expect(inferColumnType(values)).toBe('mixed')
    })

    it('handles null and empty values', () => {
      const values = [null, '', undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      expect(inferColumnType(values)).toBe('number')
    })
  })

  describe('buildMetadata', () => {
    it('creates metadata with column order and types', () => {
      const columnOrder = ['name', 'age', 'email']
      const types = { name: 'string' as const, age: 'number' as const, email: 'string' as const }
      const result = buildMetadata(columnOrder, types)
      expect(result.__csv_meta__.columnOrder).toEqual(columnOrder)
      expect(result.__csv_meta__.types).toEqual(types)
    })
  })

  describe('stripMetadata', () => {
    it('removes __csv_meta__ field', () => {
      const input = {
        __csv_meta__: { columnOrder: ['a'], types: { a: 'string' } },
        a: [1, 2, 3],
      }
      const result = stripMetadata(input)
      expect(result).toEqual({ a: [1, 2, 3] })
      expect((result as Record<string, unknown>).__csv_meta__).toBeUndefined()
    })
  })
})
