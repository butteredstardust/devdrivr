import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUiStore } from '@/stores/ui.store';
export default function DocsBrowser() {
    const setLastAction = useUiStore((s) => s.setLastAction);
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2", children: [_jsx("span", { className: "font-pixel text-xs text-[var(--color-text-muted)]", children: "DevDocs.io" }), _jsx("a", { href: "https://devdocs.io", target: "_blank", rel: "noopener noreferrer", className: "text-xs text-[var(--color-accent)] hover:underline", onClick: () => setLastAction('Opened in browser', 'info'), children: "Open externally" })] }), _jsx("iframe", { src: "https://devdocs.io", className: "flex-1 border-none", title: "DevDocs", sandbox: "allow-scripts allow-same-origin allow-popups allow-forms" })] }));
}
