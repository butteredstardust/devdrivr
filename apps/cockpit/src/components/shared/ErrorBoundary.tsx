// Exception to the "no class components" rule: React does not provide a
// hooks-based error boundary API, so a class component is required here.
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; fallbackMessage?: string }
type State = { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tool error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <div className="font-pixel text-lg text-[var(--color-error)]">Something broke</div>
          <pre className="max-w-lg overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-text-muted)]">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
