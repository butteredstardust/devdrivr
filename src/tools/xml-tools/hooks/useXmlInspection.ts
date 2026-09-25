import { useEffect, useState } from 'react'
import type { WorkerRpc } from '@/hooks/useWorker'
import { firstBlockingIssue } from '@/tools/xml-tools/xml-tools-helpers'
import type { XmlInspection } from '@/workers/xml.api'
import type { XmlWorker } from '@/workers/xml.worker'

export function useXmlInspection(input: string, worker: WorkerRpc<XmlWorker> | null) {
  const [inspection, setInspection] = useState<XmlInspection | null>(null)

  // Validate automatically so errors stay visible. Debounce the work to keep typing responsive.
  useEffect(() => {
    if (!worker || !input.trim()) {
      setInspection(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      worker
        .inspect(input)
        .then((result) => {
          if (!cancelled) setInspection(result)
        })
        .catch(() => {
          // A rejection is not "still checking": without a verdict of its own the
          // status line would sit at "Checking…" forever.
          if (!cancelled) {
            setInspection({
              valid: false,
              issues: [{ level: 'fatalError', message: 'The XML worker stopped responding' }],
              stats: { elements: 0, attributes: 0, textNodes: 0, depth: 0 },
            })
          }
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [worker, input])

  return {
    inspection,
    isValid: inspection?.valid ?? false,
    blockingIssue: inspection ? firstBlockingIssue(inspection.issues) : undefined,
  }
}
