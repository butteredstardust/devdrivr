import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'

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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        void handleCopy()
      }}
      aria-label={copied ? `${label}: copied` : label}
      className={`min-w-[5rem] ${copied ? 'border-[var(--color-success)] text-[var(--color-success)]' : ''} ${className}`}
    >
      {copied ? (
        <CheckIcon size={12} weight="bold" aria-hidden="true" />
      ) : (
        <CopyIcon size={12} aria-hidden="true" />
      )}
      {copied ? 'Copied' : label}
    </Button>
  )
}
