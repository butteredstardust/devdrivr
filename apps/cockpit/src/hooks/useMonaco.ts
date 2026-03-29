import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings.store'
import { getEffectiveTheme } from '@/lib/theme'
import type { Theme } from '@/types/models'
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

function resolveMonacoTheme(theme: Theme, editorTheme: string): string {
  if (editorTheme === 'cockpit-dark') return 'cockpit-dark'
  if (editorTheme === 'cockpit-light') return 'cockpit-light'
  const effective = getEffectiveTheme(theme)
  return effective === 'soft-focus' ? 'cockpit-light' : 'cockpit-dark'
}

export function useMonacoTheme(): string {
  const theme = useSettingsStore((s) => s.theme)
  const editorTheme = useSettingsStore((s) => s.editorTheme)
  const resolved = resolveMonacoTheme(theme, editorTheme)

  useEffect(() => {
    loader.init().then((monaco) => {
      if (!themesRegistered) {
        monaco.editor.defineTheme('cockpit-dark', DARK_THEME)
        monaco.editor.defineTheme('cockpit-light', LIGHT_THEME)
        themesRegistered = true
      }
      monaco.editor.setTheme(resolved)
    })
  }, [resolved])

  return resolved
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
