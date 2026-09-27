import { useState, type ReactNode } from 'react'
import { MagicWandIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Popover } from '@/components/shared/Popover'
import { SectionLabel } from '@/components/shared/SectionLabel'
import {
  CASE_TRANSFORMS,
  LINE_TRANSFORMS,
  type LineTransform,
} from '@/tools/text-editor/text-transforms'

type TextTransformMenuProps = {
  onLineTransform: (transform: LineTransform) => void
  onCaseTransform: (transform: LineTransform) => void
}

function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="px-2 pt-2 pb-1">
        <SectionLabel>{label}</SectionLabel>
      </div>
      {children}
    </>
  )
}

/**
 * A toolbar menu of text transforms. Each one changes the selected text, or the whole document
 * when nothing is selected.
 */
export function TextTransformMenu({ onLineTransform, onCaseTransform }: TextTransformMenuProps) {
  const [open, setOpen] = useState(false)

  const item = (transform: LineTransform, run: (transform: LineTransform) => void) => (
    <Button
      key={transform.id}
      variant="ghost"
      size="sm"
      onClick={() => {
        setOpen(false)
        run(transform)
      }}
      className="w-full justify-start hover:text-[var(--color-text)]"
    >
      {transform.label}
    </Button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Transform text"
      trigger={(triggerProps) => (
        <Button {...triggerProps} variant="icon" size="sm" aria-label="Transform text">
          <MagicWandIcon size={14} aria-hidden="true" />
        </Button>
      )}
    >
      <div className="flex min-h-0 min-w-52 flex-col overflow-y-auto py-1">
        <MenuSection label="Lines">
          {LINE_TRANSFORMS.map((transform) => item(transform, onLineTransform))}
        </MenuSection>
        <MenuSection label="Change case">
          {CASE_TRANSFORMS.map((transform) => item(transform, onCaseTransform))}
        </MenuSection>
      </div>
    </Popover>
  )
}
