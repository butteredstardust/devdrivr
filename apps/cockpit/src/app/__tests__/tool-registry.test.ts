import { describe, expect, it } from 'vitest'
import {
  TOOLS,
  getToolById,
  getToolsByGroup,
  OPEN_FILE_TOOL_IDS,
  SAVE_FILE_TOOL_IDS,
  MONACO_TOOL_IDS,
} from '@/app/tool-registry'

const TOOL_SMOKE_TEST_MODULES = import.meta.glob('../../tools/__tests__/*.test.tsx')

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

  it('requires a convention-matched smoke test for every registered tool', () => {
    for (const tool of TOOLS) {
      const testFile = `../../tools/__tests__/${tool.id}.test.tsx`
      expect(
        TOOL_SMOKE_TEST_MODULES,
        `${tool.id} requires a corresponding smoke test at ${testFile}`
      ).toHaveProperty(testFile)
    }
  })
})

describe('tool capability flags', () => {
  const toolIds = new Set(TOOLS.map((t) => t.id))

  // Once flags live directly on the registry entries they derive from, "every
  // capability flag refers to a registered tool id" is close to tautological — the
  // sets are built by filtering TOOLS itself, so this can only fail if a filter is
  // typo'd. The real regression this guards against is a mass-deletion or bad merge
  // silently dropping tools' flags (e.g. `usesMonaco` disappearing from JSON Tools
  // would flip its overflow mode with no type error). So beyond membership, assert
  // the exact expected size and contents for each derived set — pinned to the
  // audited values from documentation/TODO.md (11 / 11 / 17).
  it('every capability flag set only contains registered tool ids', () => {
    for (const id of OPEN_FILE_TOOL_IDS) expect(toolIds.has(id)).toBe(true)
    for (const id of SAVE_FILE_TOOL_IDS) expect(toolIds.has(id)).toBe(true)
    for (const id of MONACO_TOOL_IDS) expect(toolIds.has(id)).toBe(true)
  })

  it('OPEN_FILE_TOOL_IDS matches the audited set of 11', () => {
    expect(OPEN_FILE_TOOL_IDS).toEqual(
      new Set([
        'api-client',
        'code-formatter',
        'csv-tools',
        'json-schema-validator',
        'json-tools',
        'markdown-editor',
        'mermaid-editor',
        'refactoring-toolkit',
        'ts-playground',
        'xml-tools',
        'yaml-tools',
      ])
    )
  })

  it('SAVE_FILE_TOOL_IDS matches the audited set of 11', () => {
    expect(SAVE_FILE_TOOL_IDS).toEqual(
      new Set([
        'api-client',
        'code-formatter',
        'csv-tools',
        'json-schema-validator',
        'json-tools',
        'markdown-editor',
        'mermaid-editor',
        'refactoring-toolkit',
        'ts-playground',
        'xml-tools',
        'yaml-tools',
      ])
    )
  })

  it('MONACO_TOOL_IDS matches the audited set of 17', () => {
    expect(MONACO_TOOL_IDS).toEqual(
      new Set([
        'api-client',
        'code-formatter',
        'css-to-tailwind',
        'css-validator',
        'csv-tools',
        'curl-to-fetch',
        'diff-viewer',
        'html-validator',
        'json-schema-validator',
        'json-tools',
        'markdown-editor',
        'mermaid-editor',
        'refactoring-toolkit',
        'snippets',
        'ts-playground',
        'xml-tools',
        'yaml-tools',
      ])
    )
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
