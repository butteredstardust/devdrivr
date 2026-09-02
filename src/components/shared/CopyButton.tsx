import { useEffect, useRef, useState } from 'react'
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
  // One timer, restarted on each success. Independent timers would let the first copy's timeout
  // clear the second copy's tick early, so the feedback got shorter the more you used it.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(resetTimer.current), [])

  async function handleCopy() {
    // The tick is the button's own claim that the text is on the clipboard, so it waits on the
    // result rather than on the click.
    if (!(await copy(text))) return
    setCopied(true)
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCopied(false), 1500)
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
