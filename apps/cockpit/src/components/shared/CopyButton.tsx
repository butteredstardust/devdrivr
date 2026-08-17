import { useState } from 'react'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { Button } from '@/components/shared/Button'

type CopyButtonProps = {
  text: string
  label?: string
  className?: string
}

export function CopyButton({ text, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const copy = useCopyToClipboard()

  async function handleCopy() {
    // The tick is the button's own claim that the text is on the clipboard, so it waits on the
    // result rather than on the click.
    if (!(await copy(text))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
