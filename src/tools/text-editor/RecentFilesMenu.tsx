import { useState } from 'react'
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Popover } from '@/components/shared/Popover'
import { filenameFromPath } from '@/lib/file-io'
import { useRecentFilesStore } from '@/stores/recent-files.store'

function folderOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index > 0 ? path.slice(0, index) : ''
}

/** A toolbar button that lists the files the Text Editor opened or saved most recently. */
export function RecentFilesMenu({ onOpen }: { onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const paths = useRecentFilesStore((s) => s.paths)
  const load = useRecentFilesStore((s) => s.load)
  const clear = useRecentFilesStore((s) => s.clear)

  const changeOpen = (next: boolean) => {
    if (next) void load()
    setOpen(next)
  }

  return (
    <Popover
      open={open}
      onOpenChange={changeOpen}
      label="Recent files"
      trigger={(triggerProps) => (
        <Button {...triggerProps} variant="icon" size="sm" aria-label="Recent files">
          <ClockCounterClockwiseIcon size={14} aria-hidden="true" />
        </Button>
      )}
    >
      <div className="flex min-h-0 w-80 max-w-[80vw] flex-col overflow-y-auto py-1">
        {paths.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--color-text-muted)]">No recent files</p>
        ) : (
          <>
            {paths.map((path) => (
              <Button
                key={path}
                variant="ghost"
                size="sm"
                title={path}
                aria-label={`Open ${path}`}
                onClick={() => {
                  setOpen(false)
                  onOpen(path)
                }}
                className="h-auto w-full flex-col items-start gap-0 py-1 text-left hover:text-[var(--color-text)]"
              >
                <span className="w-full truncate">{filenameFromPath(path)}</span>
                <span className="w-full truncate text-2xs text-[var(--color-text-muted)]">
                  {folderOf(path)}
                </span>
              </Button>
            ))}
            <div className="my-1 border-t border-[var(--color-border)]" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                void clear()
              }}
              className="w-full justify-start hover:text-[var(--color-text)]"
            >
              Clear recent files
            </Button>
          </>
        )}
      </div>
    </Popover>
  )
}
