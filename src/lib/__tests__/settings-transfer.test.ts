import { describe, expect, it } from 'vitest'
import { parseSettingsImport } from '@/lib/settings-transfer'

describe('settings transfer', () => {
  it('validates ranges, clamps panel widths, and removes duplicate navigation entries', () => {
    expect(
      parseSettingsImport(
        JSON.stringify({
          editorFontSize: 18,
          defaultIndentSize: 4,
          sidebarWidth: 10_000,
          notesDrawerWidth: 1,
          collapsedSidebarGroups: ['code', 'future-group', 'code'],
        })
      )
    ).toEqual({
      editorFontSize: 18,
      defaultIndentSize: 4,
      sidebarWidth: 420,
      notesDrawerWidth: 280,
      collapsedSidebarGroups: ['code'],
    })
  })

  it('rejects invalid known values and payloads with no recognized settings', () => {
    expect(() => parseSettingsImport('{"editorFontSize":-10}')).toThrow('editorFontSize')
    expect(() => parseSettingsImport('{"defaultTimezone":"Mars/Olympus"}')).toThrow(
      'defaultTimezone'
    )
    expect(() => parseSettingsImport('{"futureSetting":true}')).toThrow('no recognized settings')
  })
})
