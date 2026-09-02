import { WrenchIcon } from '@phosphor-icons/react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ToolLayout } from '@/components/shared/ToolLayout'

export default function Placeholder() {
  return (
    <ToolLayout fullBleed>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={WrenchIcon}
          title="Coming soon"
          description="This tool is not yet implemented."
        />
      </div>
    </ToolLayout>
  )
}
