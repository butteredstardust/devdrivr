import type { ToolGroupMeta } from '@/types/tools'
import {
  CodeIcon,
  DatabaseIcon,
  GlobeIcon,
  ArrowsLeftRightIcon,
  CheckCircleIcon,
  WifiHighIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react'

export const TOOL_GROUPS: ToolGroupMeta[] = [
  { id: 'code', label: 'Code', icon: <CodeIcon size={14} /> },
  { id: 'data', label: 'Data', icon: <DatabaseIcon size={14} /> },
  { id: 'web', label: 'Web', icon: <GlobeIcon size={14} /> },
  { id: 'convert', label: 'Convert', icon: <ArrowsLeftRightIcon size={14} /> },
  { id: 'test', label: 'Test', icon: <CheckCircleIcon size={14} /> },
  { id: 'network', label: 'Network', icon: <WifiHighIcon size={14} /> },
  { id: 'write', label: 'Write', icon: <PencilSimpleIcon size={14} /> },
]
