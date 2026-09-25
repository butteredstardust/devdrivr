import { useEffect, useState } from 'react'
import { ArrowsInLineVerticalIcon, ArrowsOutLineVerticalIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { InspectorDisclosure } from '@/components/shared/InspectorTree'
import { PaneHeader } from '@/components/shared/PaneHeader'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { WorkerRpc } from '@/hooks/useWorker'
import { LARGE_DOCUMENT_ELEMENTS, nodeToXml } from '@/tools/xml-tools/xml-tools-helpers'
import type { XmlTreeNode } from '@/workers/xml.api'
import type { XmlWorker } from '@/workers/xml.worker'

export function TreePane({
  input,
  worker,
  elementCount,
  onCopy,
}: {
  input: string
  worker: WorkerRpc<XmlWorker> | null
  elementCount: number
  onCopy: CopyToClipboard
}) {
  // A 5000-element document rendered fully expanded janks the pane on open, so
  // the default follows the document size until the user overrides it.
  const [expandAll, setExpandAll] = useState<boolean | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const autoExpanded = elementCount <= LARGE_DOCUMENT_ELEMENTS
  const expanded = expandAll ?? autoExpanded

  const setExpansion = (next: boolean) => {
    setExpandAll(next)
    setTreeKey((k) => k + 1)
  }

  // Built on the worker thread from the same parse that validates the document,
  // so the tree never disagrees with the status line.
  const [tree, setTree] = useState<XmlTreeNode | null>(null)
  useEffect(() => {
    if (!worker || !input.trim()) {
      setTree(null)
      return
    }
    let cancelled = false
    // Debounced like every other pane: this one is open *beside* the editor
    // while the user types, so an undebounced re-parse plus a full recursive
    // re-render would land on every keystroke.
    const timer = setTimeout(() => {
      worker
        .tree(input)
        .then((result) => {
          if (!cancelled) setTree(result)
        })
        .catch(() => {
          if (!cancelled) setTree(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  return (
    <>
      <PaneHeader
        title="Tree"
        actions={
          <>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(true)}
              className="gap-1"
              title="Expand every node"
            >
              <ArrowsOutLineVerticalIcon size={12} aria-hidden="true" />
              Expand all
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setExpansion(false)}
              className="gap-1"
              title="Collapse every node"
            >
              <ArrowsInLineVerticalIcon size={12} aria-hidden="true" />
              Collapse all
            </Button>
            {expandAll === null && !autoExpanded && (
              <span className="text-2xs text-[var(--color-text-muted)]">
                Collapsed — {elementCount} elements
              </span>
            )}
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono">
        {tree ? (
          <TreeNodeRow
            key={treeKey}
            node={tree}
            path={tree.type === 'element' ? `/${tree.name}` : '/'}
            defaultExpanded={expanded}
            onCopy={onCopy}
          />
        ) : (
          <EmptyState
            size="sm"
            title="Nothing to show"
            description="This document has no root element."
          />
        )}
      </div>
    </>
  )
}

function TreeNodeRow({
  node,
  path,
  depth = 0,
  defaultExpanded,
  onCopy,
}: {
  node: XmlTreeNode
  path: string
  depth?: number
  defaultExpanded: boolean
  onCopy: CopyToClipboard
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const indent = depth * 16

  if (node.type === 'text') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs">
        <span className="text-[var(--color-success)]">&quot;{node.value}&quot;</span>
      </div>
    )
  }

  if (node.type === 'comment') {
    return (
      <div
        style={{ paddingLeft: indent }}
        className="py-0.5 text-xs text-[var(--color-text-muted)]"
      >
        &lt;!-- {node.value} --&gt;
      </div>
    )
  }

  if (node.type === 'cdata') {
    return (
      <div style={{ paddingLeft: indent }} className="py-0.5 text-xs text-[var(--color-warning)]">
        &lt;![CDATA[{node.value}]]&gt;
      </div>
    )
  }

  if (node.type === 'pi') {
    return (
      <div
        style={{ paddingLeft: indent }}
        className="py-0.5 text-xs text-[var(--color-text-muted)]"
      >
        &lt;?{node.name} {node.value}?&gt;
      </div>
    )
  }

  const hasChildren = node.children.length > 0
  return (
    <div>
      <div className="group flex items-center gap-1" style={{ paddingLeft: indent }}>
        <div className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-xs hover:bg-[var(--color-surface-hover)]">
          <InspectorDisclosure
            expanded={expanded}
            hasChildren={hasChildren}
            label={path}
            onToggle={() => setExpanded((current) => !current)}
            className="w-3 shrink-0"
          />
          {/* One span, no flex gap: the pieces of a tag have to read as a tag,
              not as `<catalog >`. */}
          <span className="truncate">
            <span className="text-[var(--color-accent)]">&lt;{node.name}</span>
            {Object.entries(node.attributes).map(([key, value]) => (
              <span key={key}>
                <span className="text-[var(--color-info)]"> {key}</span>
                <span className="text-[var(--color-text-muted)]">=</span>
                <span className="text-[var(--color-warning)]">&quot;{value}&quot;</span>
              </span>
            ))}
            <span className="text-[var(--color-accent)]">{hasChildren ? '>' : ' />'}</span>
          </span>
        </div>
        {/* Always in the tab order: a copy affordance that only appears on hover
            is invisible to keyboard and touch users. */}
        <Button
          variant="ghost"
          size="xs"
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => void onCopy(nodeToXml(node), { success: `Copied <${node.name}>` })}
          aria-label={`Copy <${node.name}> element`}
          title="Copy this element"
        >
          Copy
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => void onCopy(path, { success: `Copied XPath ${path}` })}
          aria-label={`Copy XPath ${path}`}
          title="Copy XPath"
        >
          XPath
        </Button>
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child, i) => {
          const siblingIndex =
            child.type === 'element'
              ? node.children
                  .slice(0, i + 1)
                  .filter((sibling) => sibling.type === 'element' && sibling.name === child.name)
                  .length
              : 0
          const siblingCount =
            child.type === 'element'
              ? node.children.filter(
                  (sibling) => sibling.type === 'element' && sibling.name === child.name
                ).length
              : 0
          const childPath =
            child.type === 'element'
              ? `${path}/${child.name}${siblingCount > 1 ? `[${siblingIndex}]` : ''}`
              : path
          return (
            <TreeNodeRow
              key={i}
              node={child}
              path={childPath}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              onCopy={onCopy}
            />
          )
        })}
      {expanded && hasChildren && (
        <div
          style={{ paddingLeft: indent }}
          className="py-0.5 pl-4 text-xs text-[var(--color-accent)]"
        >
          &lt;/{node.name}&gt;
        </div>
      )}
    </div>
  )
}
