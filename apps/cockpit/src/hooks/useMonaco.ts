import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'
import { loader } from '@monaco-editor/react'

const DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1a1a1a',
    'editor.foreground': '#e0e0e0',
    'editorLineNumber.foreground': '#555555',
    'editor.selectionBackground': '#39ff1433',
    'editor.lineHighlightBackground': '#252525',
    'editorCursor.foreground': '#39ff14',
  },
}

const LIGHT_THEME = {
  base: 'vs' as const,
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a1a',
    'editorLineNumber.foreground': '#999999',
    'editor.selectionBackground': '#00875a33',
    'editor.lineHighlightBackground': '#f0eee6',
    'editorCursor.foreground': '#00875a',
  },
}

let themesRegistered = false

export function useMonacoTheme() {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    loader.init().then((monaco) => {
      if (!themesRegistered) {
        monaco.editor.defineTheme('cockpit-dark', DARK_THEME)
        monaco.editor.defineTheme('cockpit-light', LIGHT_THEME)
        themesRegistered = true
      }
      const effective = getEffectiveTheme(theme)
      const isLight = effective === 'soft-focus'
      monaco.editor.setTheme(isLight ? 'cockpit-light' : 'cockpit-dark')
    })
  }, [theme])
}

/** Standard Monaco editor options shared across all tools */
export const EDITOR_OPTIONS = {
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on' as const,
  padding: { top: 12, bottom: 12 },
} as const
