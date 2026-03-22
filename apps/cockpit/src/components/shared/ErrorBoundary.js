import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('Tool error:', error, info.componentStack);
    }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-8", children: [_jsx("div", { className: "font-pixel text-lg text-[var(--color-error)]", children: "Something broke" }), _jsx("pre", { className: "max-w-lg overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-text-muted)]", children: this.state.error?.message }), _jsx("button", { onClick: () => this.setState({ hasError: false, error: null }), className: "rounded border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]", children: "Try Again" })] }));
        }
        return this.props.children;
    }
}
