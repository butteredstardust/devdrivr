import { describe, expect, it } from 'vitest'
import { TOOLS, getToolById, getToolsByGroup } from '../tool-registry'

describe('TOOLS registry', () => {
  it('has no duplicate IDs', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every tool has required fields', () => {
    for (const tool of TOOLS) {
      expect(tool.id).toBeTruthy()
      expect(tool.name).toBeTruthy()
      expect(tool.group).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.component).toBeDefined()
    }
  })

  it('every tool group is a known group', () => {
    const knownGroups = ['code', 'data', 'web', 'convert', 'test', 'network', 'write']
    for (const tool of TOOLS) {
      expect(knownGroups).toContain(tool.group)
    }
  })
})

describe('getToolById', () => {
  it('finds a tool by ID', () => {
    const tool = getToolById('json-tools')
    expect(tool).toBeDefined()
    expect(tool!.name).toBe('JSON Tools')
  })

  it('returns undefined for unknown ID', () => {
    expect(getToolById('nonexistent-tool')).toBeUndefined()
  })
})

describe('getToolsByGroup', () => {
  it('returns tools for a valid group', () => {
    const codeTools = getToolsByGroup('code')
    expect(codeTools.length).toBeGreaterThan(0)
    for (const tool of codeTools) {
      expect(tool.group).toBe('code')
    }
  })

  it('returns empty array for unknown group', () => {
    expect(getToolsByGroup('nonexistent')).toEqual([])
  })
})
