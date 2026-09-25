import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { CopyToClipboard } from '@/hooks/useCopyToClipboard'
import { buildExportFilename, exportFile } from '@/lib/file-io'
import { useUiStore } from '@/stores/ui.store'
import {
  BASE_EXPORT_STYLES,
  PRINT_STYLES,
  renderMarkdownContent,
} from '@/tools/markdown-editor/markdown-model'

type UseMarkdownExportOptions = {
  content: string
  fileName: string | null
  copy: CopyToClipboard
  setShowExport: Dispatch<SetStateAction<boolean>>
}

export function useMarkdownExport({
  content,
  fileName,
  copy,
  setShowExport,
}: UseMarkdownExportOptions) {
  const setLastAction = useUiStore((s) => s.setLastAction)

  // ─── Export handlers ─────────────────────────────────────────────

  const buildFullHtml = useCallback(
    (bodyHtml: string, styles: string) =>
      `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Export</title>\n<style>${styles}</style>\n</head><body>${bodyHtml}</body></html>`,
    []
  )

  const buildCurrentExportHtml = useCallback(
    async (styles: string) => buildFullHtml(await renderMarkdownContent(content), styles),
    [buildFullHtml, content]
  )

  const handleCopyHtml = useCallback(async () => {
    await copy(await buildCurrentExportHtml(BASE_EXPORT_STYLES), {
      success: 'HTML copied to clipboard',
      failure: 'Failed to copy HTML',
    })
    setShowExport(false)
  }, [buildCurrentExportHtml, copy, setShowExport])

  const handleDownload = useCallback(
    async (format: 'md' | 'html') => {
      const exportContent =
        format === 'md' ? content : await buildCurrentExportHtml(BASE_EXPORT_STYLES)
      try {
        const baseName = fileName?.replace(/\.[^.]+$/, '') ?? 'document'
        const path = await exportFile(exportContent, buildExportFilename(baseName, format))
        if (path) setLastAction(`Downloaded as .${format}`, 'success')
      } catch {
        setLastAction('Download failed', 'error')
      }
      setShowExport(false)
    },
    [buildCurrentExportHtml, content, fileName, setLastAction, setShowExport]
  )

  const handleExportPdf = useCallback(async () => {
    const fullHtml = await buildCurrentExportHtml(PRINT_STYLES)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px'
    document.body.appendChild(iframe)
    const iframeDoc = iframe.contentWindow?.document
    if (!iframeDoc) {
      document.body.removeChild(iframe)
      return
    }
    iframeDoc.open()
    iframeDoc.write(fullHtml)
    iframeDoc.close()
    const win = iframe.contentWindow
    if (!win) {
      document.body.removeChild(iframe)
      return
    }
    win.addEventListener('afterprint', () => document.body.removeChild(iframe), { once: true })
    win.focus()
    try {
      win.print()
    } catch {
      document.body.removeChild(iframe)
      return
    }
    setLastAction('Print dialog opened', 'success')
    setShowExport(false)
  }, [buildCurrentExportHtml, setLastAction, setShowExport])

  return { handleCopyHtml, handleDownload, handleExportPdf }
}
