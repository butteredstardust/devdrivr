import { describe, expect, it, vi } from 'vitest';
import { getEffectiveTheme } from '../theme';
describe('getEffectiveTheme', () => {
    it('returns dark when theme is dark', () => {
        expect(getEffectiveTheme('dark')).toBe('dark');
    });
    it('returns light when theme is light', () => {
        expect(getEffectiveTheme('light')).toBe('light');
    });
    it('returns dark when theme is system and prefers dark', () => {
        vi.stubGlobal('window', {
            matchMedia: vi.fn().mockReturnValue({ matches: true }),
        });
        expect(getEffectiveTheme('system')).toBe('dark');
        vi.unstubAllGlobals();
    });
    it('returns light when theme is system and prefers light', () => {
        vi.stubGlobal('window', {
            matchMedia: vi.fn().mockReturnValue({ matches: false }),
        });
        expect(getEffectiveTheme('system')).toBe('light');
        vi.unstubAllGlobals();
    });
});
