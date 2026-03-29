import { useState } from 'react'
import { useUiStore } from '@/stores/ui.store'

type CopyButtonProps = {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const setLastAction = useUiStore((s) => s.setLastAction)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setLastAction('Copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setLastAction('Failed to copy to clipboard', 'error')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`min-w-[5rem] rounded border border-[var(--color-border)] px-2 py-1 text-xs transition-colors duration-150 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] ${copied ? 'border-[var(--color-success)] text-[var(--color-success)]' : ''} ${className}`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
