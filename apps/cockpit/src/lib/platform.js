export function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac'))
        return 'mac';
    if (ua.includes('win'))
        return 'windows';
    return 'linux';
}
export function getModKey(platform) {
    return platform === 'mac' ? 'Cmd' : 'Ctrl';
}
export function getModKeySymbol(platform) {
    return platform === 'mac' ? '⌘' : 'Ctrl';
}
