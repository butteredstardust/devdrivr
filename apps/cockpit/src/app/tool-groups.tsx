import type { ToolGroupMeta } from '@/types/tools'
import { Code, Database, Globe, ArrowsLeftRight, CheckCircle, WifiHigh, PencilSimple } from '@phosphor-icons/react'

export const TOOL_GROUPS: ToolGroupMeta[] = [
  { id: 'code', label: 'Code', icon: <Code size={14} /> },
  { id: 'data', label: 'Data', icon: <Database size={14} /> },
  { id: 'web', label: 'Web', icon: <Globe size={14} /> },
  { id: 'convert', label: 'Convert', icon: <ArrowsLeftRight size={14} /> },
  { id: 'test', label: 'Test', icon: <CheckCircle size={14} /> },
  { id: 'network', label: 'Network', icon: <WifiHigh size={14} /> },
  { id: 'write', label: 'Write', icon: <PencilSimple size={14} /> },
]
