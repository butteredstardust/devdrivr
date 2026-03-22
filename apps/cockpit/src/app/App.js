import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { Sidebar } from '@/components/shell/Sidebar';
import { Workspace } from '@/components/shell/Workspace';
import { NotesDrawer } from '@/components/shell/NotesDrawer';
import { StatusBar } from '@/components/shell/StatusBar';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ToastContainer } from '@/components/shared/Toast';
import { SendToMenu, SendToContext } from '@/components/shared/SendToMenu';
import { SettingsPanel } from '@/components/shell/SettingsPanel';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
export function App() {
    useGlobalShortcuts();
    const [sendTo, setSendTo] = useState(null);
    const showSendTo = useCallback((content, position) => {
        setSendTo({ content, position });
    }, []);
    const closeSendTo = useCallback(() => setSendTo(null), []);
    return (_jsxs(SendToContext.Provider, { value: { showSendTo }, children: [_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx(Sidebar, {}), _jsx("main", { className: "flex-1 overflow-hidden", children: _jsx(Workspace, {}) }), _jsx(NotesDrawer, {})] }), _jsx(StatusBar, {}), _jsx(CommandPalette, {}), _jsx(ToastContainer, {}), _jsx(SettingsPanel, {})] }), sendTo && _jsx(SendToMenu, { content: sendTo.content, position: sendTo.position, onClose: closeSendTo })] }));
}
