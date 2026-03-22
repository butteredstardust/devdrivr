export function getEffectiveTheme(theme) {
    if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
}
export function applyTheme(theme) {
    const effective = getEffectiveTheme(theme);
    const html = document.documentElement;
    html.classList.remove('dark', 'light');
    html.classList.add(effective);
}
