import {
  FilePlusIcon,
  FloppyDiskBackIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { ToolbarGroup } from '@/components/shared/Toolbar'

type FileAction = {
  onClick: () => void
  label: string
  title?: string
  disabled?: boolean
}

type DocumentFileActionsProps = {
  newDocument?: FileAction
  open?: FileAction
  save?: FileAction
  saveAs?: FileAction
  separated?: boolean
}

/** Canonical file-action order and icon treatment for document editor toolbars. */
export function DocumentFileActions({
  newDocument,
  open,
  save,
  saveAs,
  separated = true,
}: DocumentFileActionsProps) {
  const actions = [
    newDocument && { ...newDocument, icon: FilePlusIcon },
    open && { ...open, icon: FolderOpenIcon },
    save && { ...save, icon: FloppyDiskIcon },
    saveAs && { ...saveAs, icon: FloppyDiskBackIcon },
  ].filter((action): action is FileAction & { icon: typeof FilePlusIcon } => Boolean(action))

  if (actions.length === 0) return null

  return (
    <ToolbarGroup label="File actions" separated={separated}>
      {actions.map(({ icon: Icon, label, title, onClick, disabled }) => (
        <Button
          key={label}
          variant="icon"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          title={title ?? label}
          aria-label={label}
        >
          <Icon size={14} aria-hidden="true" />
        </Button>
      ))}
    </ToolbarGroup>
  )
}
