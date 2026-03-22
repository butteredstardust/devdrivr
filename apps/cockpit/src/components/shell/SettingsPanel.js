import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/stores/settings.store';
import { useUiStore } from '@/stores/ui.store';
import { getCurrentWindow } from '@tauri-apps/api/window';
const INDENT_OPTIONS = [2, 4];
const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20];
const THEME_OPTIONS = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
];
const KEYBINDING_OPTIONS = [
    { value: 'standard', label: 'Standard' },
    { value: 'vim', label: 'Vim' },
    { value: 'emacs', label: 'Emacs' },
];
function SettingRow({ label, children }) {
    return (_jsxs("div", { className: "flex items-center justify-between py-2", children: [_jsx("span", { className: "text-xs text-[var(--color-text)]", children: label }), _jsx("div", { className: "flex items-center", children: children })] }));
}
export function SettingsPanel() {
    const open = useUiStore((s) => s.settingsPanelOpen);
    const setOpen = useUiStore((s) => s.setSettingsPanelOpen);
    const update = useSettingsStore((s) => s.update);
    const theme = useSettingsStore((s) => s.theme);
    const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
    const defaultIndentSize = useSettingsStore((s) => s.defaultIndentSize);
    const editorFontSize = useSettingsStore((s) => s.editorFontSize);
    const editorKeybindingMode = useSettingsStore((s) => s.editorKeybindingMode);
    const historyRetentionPerTool = useSettingsStore((s) => s.historyRetentionPerTool);
    const formatOnPaste = useSettingsStore((s) => s.formatOnPaste);
    const defaultTimezone = useSettingsStore((s) => s.defaultTimezone);
    const panelRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        function handleEscape(e) {
            if (e.key === 'Escape')
                setOpen(false);
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [open, setOpen]);
    const handleAlwaysOnTop = useCallback((checked) => {
        getCurrentWindow().setAlwaysOnTop(checked);
        update('alwaysOnTop', checked);
    }, [update]);
    if (!open)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: _jsxs("div", { ref: panelRef, className: "w-full max-w-md rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3", children: [_jsx("h2", { className: "font-pixel text-sm text-[var(--color-accent)]", children: "Settings" }), _jsx("button", { onClick: () => setOpen(false), className: "text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]", children: "\u00D7" })] }), _jsxs("div", { className: "divide-y divide-[var(--color-border)] px-4", children: [_jsxs("div", { className: "py-3", children: [_jsx("h3", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "Appearance" }), _jsx(SettingRow, { label: "Theme", children: _jsx("select", { value: theme, onChange: (e) => update('theme', e.target.value), className: "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]", children: THEME_OPTIONS.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) }) }), _jsx(SettingRow, { label: "Always on Top", children: _jsx("input", { type: "checkbox", checked: alwaysOnTop, onChange: (e) => handleAlwaysOnTop(e.target.checked), className: "accent-[var(--color-accent)]" }) })] }), _jsxs("div", { className: "py-3", children: [_jsx("h3", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "Editor" }), _jsx(SettingRow, { label: "Font Size", children: _jsx("select", { value: editorFontSize, onChange: (e) => update('editorFontSize', Number(e.target.value)), className: "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]", children: FONT_SIZE_OPTIONS.map((s) => (_jsxs("option", { value: s, children: [s, "px"] }, s))) }) }), _jsx(SettingRow, { label: "Indent Size", children: _jsx("select", { value: defaultIndentSize, onChange: (e) => update('defaultIndentSize', Number(e.target.value)), className: "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]", children: INDENT_OPTIONS.map((s) => (_jsxs("option", { value: s, children: [s, " spaces"] }, s))) }) }), _jsx(SettingRow, { label: "Keybinding Mode", children: _jsx("select", { value: editorKeybindingMode, onChange: (e) => update('editorKeybindingMode', e.target.value), className: "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]", children: KEYBINDING_OPTIONS.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) }) }), _jsx(SettingRow, { label: "Format on Paste", children: _jsx("input", { type: "checkbox", checked: formatOnPaste, onChange: (e) => update('formatOnPaste', e.target.checked), className: "accent-[var(--color-accent)]" }) })] }), _jsxs("div", { className: "py-3", children: [_jsx("h3", { className: "mb-2 font-pixel text-xs text-[var(--color-text-muted)]", children: "Data" }), _jsx(SettingRow, { label: "History per Tool", children: _jsx("input", { type: "number", value: historyRetentionPerTool, onChange: (e) => update('historyRetentionPerTool', Math.max(10, Number(e.target.value))), min: 10, max: 5000, className: "w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)]" }) }), _jsx(SettingRow, { label: "Default Timezone", children: _jsx("input", { value: defaultTimezone, onChange: (e) => update('defaultTimezone', e.target.value), className: "w-40 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)]" }) })] })] }), _jsx("div", { className: "border-t border-[var(--color-border)] px-4 py-3 text-right", children: _jsx("span", { className: "text-[10px] text-[var(--color-text-muted)]", children: "Changes saved automatically" }) })] }) }));
}
