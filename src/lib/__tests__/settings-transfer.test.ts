import { describe, expect, it } from 'vitest'
import { parseSettingsImport, sanitizeStoredSettings } from '@/lib/settings-transfer'

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
          recentToolsLimit: 5,
          restoreWorkspaceOnLaunch: false,
          editorScrollBeyondLastLine: true,
        })
      )
    ).toEqual({
      editorFontSize: 18,
      defaultIndentSize: 4,
      sidebarWidth: 420,
      notesDrawerWidth: 280,
      collapsedSidebarGroups: ['code'],
      recentToolsLimit: 5,
      restoreWorkspaceOnLaunch: false,
      editorScrollBeyondLastLine: true,
    })
  })

  it('rejects invalid known values and payloads with no recognized settings', () => {
    expect(() => parseSettingsImport('{"editorFontSize":-10}')).toThrow('editorFontSize')
    expect(() => parseSettingsImport('{"defaultTimezone":"Mars/Olympus"}')).toThrow(
      'defaultTimezone'
    )
    expect(() => parseSettingsImport('{"recentToolsLimit":6}')).toThrow('recentToolsLimit')
    expect(() => parseSettingsImport('{"restoreWorkspaceOnLaunch":"yes"}')).toThrow(
      'restoreWorkspaceOnLaunch'
    )
    expect(() => parseSettingsImport('{"editorScrollBeyondLastLine":"yes"}')).toThrow(
      'editorScrollBeyondLastLine'
    )
    expect(() => parseSettingsImport('{"futureSetting":true}')).toThrow('no recognized settings')
  })

  it('sanitizes stored settings one key at a time', () => {
    expect(
      sanitizeStoredSettings({
        theme: 'midnight',
        editorFontSize: 'large',
        sidebarWidth: 10_000,
        futureSetting: true,
      })
    ).toEqual({ theme: 'midnight', sidebarWidth: 420 })
    expect(sanitizeStoredSettings('corrupt')).toEqual({})
  })
})
