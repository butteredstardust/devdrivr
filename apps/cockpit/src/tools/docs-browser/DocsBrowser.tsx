import { useUiStore } from '@/stores/ui.store'

export default function DocsBrowser() {
  const setLastAction = useUiStore((s) => s.setLastAction)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">DevDocs.io</span>
        <a
          href="https://devdocs.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--color-accent)] hover:underline"
          onClick={() => setLastAction('Opened in browser', 'info')}
        >
          Open externally
        </a>
      </div>
      <iframe
        src="https://devdocs.io"
        className="flex-1 border-none"
        title="DevDocs"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  )
}
