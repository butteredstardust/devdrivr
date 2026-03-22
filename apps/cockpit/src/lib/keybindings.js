import { detectPlatform } from '@/lib/platform';
export function matchesCombo(event, combo) {
    const platform = detectPlatform();
    const modKey = platform === 'mac' ? event.metaKey : event.ctrlKey;
    if (combo.mod && !modKey)
        return false;
    if (!combo.mod && modKey)
        return false;
    if (combo.shift && !event.shiftKey)
        return false;
    if (!combo.shift && event.shiftKey)
        return false;
    if (combo.alt && !event.altKey)
        return false;
    return event.key.toLowerCase() === combo.key.toLowerCase();
}
export function formatCombo(combo, modSymbol) {
    const parts = [];
    if (combo.mod)
        parts.push(modSymbol);
    if (combo.shift)
        parts.push('Shift');
    if (combo.alt)
        parts.push('Alt');
    parts.push(combo.key.toUpperCase());
    return parts.join('+');
}
