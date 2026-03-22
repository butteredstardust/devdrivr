export type Theme = 'dark' | 'light' | 'system'

export function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyTheme(theme: Theme): void {
  const effective = getEffectiveTheme(theme)
  const html = document.documentElement
  html.classList.remove('dark', 'light')
  html.classList.add(effective)
  // Cache for synchronous restore on next load (see index.html inline script)
  try { localStorage.setItem('theme-cache', effective) } catch { /* quota/sandbox */ }
}
