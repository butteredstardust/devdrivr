import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Kbd } from '@/components/shared/Kbd'
import { Alert } from '@/components/shared/Alert'
import { PaneHeader } from '@/components/shared/PaneHeader'
import { SplitPane } from '@/components/shared/SplitPane'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { Button } from '@/components/shared/Button'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { Toolbar, ToolbarGroup, ToolbarSpacer } from '@/components/shared/Toolbar'
import { Toggle } from '@/components/shared/Toggle'
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  UploadSimpleIcon,
  FileIcon,
  XIcon,
  DownloadSimpleIcon,
} from '@phosphor-icons/react'
import { formatBytes } from '@/lib/format'
import { exportFile } from '@/lib/file-io'
import { useWorker } from '@/hooks/useWorker'
import type { Base64Worker } from '@/workers/base64.worker'
import Base64WorkerFactory from '@/workers/base64.worker?worker'
import { transformBase64, type Base64TransformResult } from '@/workers/base64.api'

type Base64State = {
  input: string
  mode: 'encode' | 'decode'
  urlSafe: boolean
  lineWrap: boolean
}

type DroppedFile = {
  name: string
  dataUri: string // full data:mime;base64,xxxx
  mimeType: string
  size: number
}

type ImgTransform = { x: number; y: number; scale: number }

// ── Constants ──────────────────────────────────────────────────────

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const DEFAULT_IMG_TRANSFORM: ImgTransform = { x: 0, y: 0, scale: 1 }
const WORKER_THRESHOLD = 100_000
type WorkerOutput = {
  input: string
  mode: Base64State['mode']
  urlSafe: boolean
  lineWrap: boolean
  result: Base64TransformResult
}

// ── Helpers ────────────────────────────────────────────────────────

function isValidBase64(str: string): boolean {
  if (!str.trim()) return false
  try {
    return btoa(atob(str)) === str.replace(/\s/g, '')
  } catch {
    return false
  }
}

function encodeTextBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function detectImageMime(b64: string): string | null {
  const clean = b64.replace(/\s/g, '')
  if (clean.startsWith('/9j/')) return 'image/jpeg'
  if (clean.startsWith('iVBOR')) return 'image/png'
  if (clean.startsWith('R0lGOD')) return 'image/gif'
  if (clean.startsWith('UklGR')) return 'image/webp'
  if (clean.startsWith('PHN2Zy')) return 'image/svg+xml'
  return null
}

/**
 * Same transform the worker applies to text (`src/workers/base64.api.ts`), so file mode honours
 * the URL-safe option instead of silently copying standard Base64.
 */
function toUrlSafeBase64(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A file is read entirely into a data URI held in React state, and Base64 adds ~33% before
 * JavaScript string overhead. Reject oversized files before reading rather than freezing the
 * renderer partway through.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ── Component ──────────────────────────────────────────────────────

export default function Base64Tool() {
  const [state, updateState] = useToolState<Base64State>('base64', {
    input: '',
    mode: 'encode',
    urlSafe: false,
    lineWrap: false,
  })
  const { record } = useToolHistory({ toolId: 'base64' })
  const setLastAction = useUiStore((s) => s.setLastAction)
  const [pipelineInput, setPipelineInput] = useState(state.input)
  const worker = useWorker<Base64Worker>(() => new Base64WorkerFactory(), ['transformBase64'])
  const [workerOutput, setWorkerOutput] = useState<WorkerOutput | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setPipelineInput(state.input), 200)
    return () => clearTimeout(timer)
  }, [state.input])

  // ── File encode state ──────────────────────────────────────────

  const [droppedFile, setDroppedFile] = useState<DroppedFile | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clear file when switching to decode
  useEffect(() => {
    if (state.mode === 'decode') setDroppedFile(null)
  }, [state.mode])

  // ── Image pan & zoom ───────────────────────────────────────────

  const [imgTransform, _setImgTransform] = useState<ImgTransform>(DEFAULT_IMG_TRANSFORM)
  const imgTransformRef = useRef<ImgTransform>(DEFAULT_IMG_TRANSFORM)
  const setImgTransform = useCallback((t: ImgTransform) => {
    imgTransformRef.current = t
    _setImgTransform(t)
  }, [])

  const isImgViewDefault = imgTransform.scale === 1 && imgTransform.x === 0 && imgTransform.y === 0

  const isImgPanning = useRef(false)
  const imgPanStart = useRef({ mouseX: 0, mouseY: 0, originX: 0, originY: 0 })
  const wheelCleanupRef = useRef<(() => void) | null>(null)

  // Callback ref: attaches/detaches the non-passive wheel listener whenever the
  // image container mounts or unmounts. A single useRef + useEffect approach
  // fails here because imgViewRef is shared across two mutually-exclusive
  // conditional branches, so the effect runs once on mount when both are null.
  const imgViewRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (wheelCleanupRef.current) {
        wheelCleanupRef.current()
        wheelCleanupRef.current = null
      }
      if (!el) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top
        const { x, y, scale } = imgTransformRef.current
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor))
        const ratio = newScale / scale
        setImgTransform({
          x: cursorX + (x - cursorX) * ratio,
          y: cursorY + (y - cursorY) * ratio,
          scale: newScale,
        })
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      wheelCleanupRef.current = () => el.removeEventListener('wheel', onWheel)
    },
    [setImgTransform]
  )

  const handleImgMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    isImgPanning.current = true
    const { x, y } = imgTransformRef.current
    imgPanStart.current = { mouseX: e.clientX, mouseY: e.clientY, originX: x, originY: y }
  }, [])

  const handleImgMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isImgPanning.current) return
      const { mouseX, mouseY, originX, originY } = imgPanStart.current
      setImgTransform({
        ...imgTransformRef.current,
        x: originX + (e.clientX - mouseX),
        y: originY + (e.clientY - mouseY),
      })
    },
    [setImgTransform]
  )

  const handleImgMouseUp = useCallback(() => {
    isImgPanning.current = false
  }, [])

  const handleImgMouseLeave = useCallback(() => {
    isImgPanning.current = false
  }, [])

  const resetImgView = useCallback(() => {
    setImgTransform(DEFAULT_IMG_TRANSFORM)
  }, [setImgTransform])

  // ── File drop handlers ─────────────────────────────────────────

  const processFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        setLastAction(
          `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)}`,
          'error'
        )
        return
      }
      try {
        const dataUri = await readFileAsDataUrl(file)
        setDroppedFile({ name: file.name, dataUri, mimeType: file.type ?? '', size: file.size })
        setImgTransform(DEFAULT_IMG_TRANSFORM)
        setLastAction(`Encoded "${file.name}"`, 'success')
        record({
          input: `Encode file: ${file.name} (${formatBytes(file.size)})`,
          output: `${file.type};base64 [${formatBytes(dataUri.length)}]`,
          subTab: 'encode-file',
          success: true,
        })
      } catch {
        setLastAction('Failed to read file', 'error')
      }
    },
    [setImgTransform, setLastAction, record]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (state.mode !== 'encode') return
      e.preventDefault()
      setIsDragOver(true)
    },
    [state.mode]
  )

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (state.mode !== 'encode') return
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [state.mode, processFile]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = '' // allow re-selecting same file
    },
    [processFile]
  )

  // ── Encode / decode pipeline ───────────────────────────────────

  const smallOutput = useMemo(
    () =>
      pipelineInput.length < WORKER_THRESHOLD
        ? transformBase64(pipelineInput, state.mode, state.urlSafe, state.lineWrap)
        : null,
    [pipelineInput, state.mode, state.urlSafe, state.lineWrap]
  )
  useEffect(() => {
    if (smallOutput || !worker) {
      setWorkerOutput(null)
      return
    }
    setWorkerOutput(null)
    let current = true
    void worker.transformBase64(pipelineInput, state.mode, state.urlSafe, state.lineWrap).then(
      (result) =>
        current &&
        setWorkerOutput({
          input: pipelineInput,
          mode: state.mode,
          urlSafe: state.urlSafe,
          lineWrap: state.lineWrap,
          result,
        }),
      () =>
        current &&
        setWorkerOutput({
          input: pipelineInput,
          mode: state.mode,
          urlSafe: state.urlSafe,
          lineWrap: state.lineWrap,
          result: transformBase64(pipelineInput, state.mode, state.urlSafe, state.lineWrap),
        })
    )
    return () => {
      current = false
    }
  }, [pipelineInput, smallOutput, state.lineWrap, state.mode, state.urlSafe, worker])
  const currentWorkerOutput =
    workerOutput?.input === pipelineInput &&
    workerOutput.mode === state.mode &&
    workerOutput.urlSafe === state.urlSafe &&
    workerOutput.lineWrap === state.lineWrap
      ? workerOutput.result
      : null
  const output =
    smallOutput ??
    currentWorkerOutput ??
    ({ text: '', bytes: null, mimeType: null, error: null } satisfies Base64TransformResult)

  const autoDetect = useMemo(() => {
    if (!pipelineInput.trim()) return null
    if (pipelineInput.length >= WORKER_THRESHOLD) return currentWorkerOutput?.error === null
    return isValidBase64(pipelineInput.replace(/\s/g, ''))
  }, [currentWorkerOutput?.error, pipelineInput])

  const inputBytes = useMemo(() => new TextEncoder().encode(pipelineInput).length, [pipelineInput])
  const outputBytes = useMemo(
    () =>
      output.bytes?.byteLength ?? (output.text ? new TextEncoder().encode(output.text).length : 0),
    [output.bytes, output.text]
  )
  const ratio = useMemo(() => {
    if (!inputBytes || !outputBytes) return null
    if (state.mode === 'encode') return (outputBytes / inputBytes).toFixed(2)
    return (inputBytes / outputBytes).toFixed(2)
  }, [inputBytes, outputBytes, state.mode])

  // Image preview (decode mode: detect image in base64 input)
  const imagePreview = useMemo(() => {
    if (state.mode !== 'decode' || !pipelineInput.trim()) return null
    const clean = pipelineInput.replace(/\s/g, '')
    const dataUriMatch = clean.match(/^data:(image\/[^;]+);base64,(.*)$/)
    if (dataUriMatch) return clean
    const mime = detectImageMime(clean)
    if (mime) return `data:${mime};base64,${clean}`
    return null
  }, [state.mode, pipelineInput])

  // Data URI builder for text encode output
  const dataUri = useMemo(() => {
    if (state.mode !== 'encode' || !pipelineInput.trim() || output.error) return null
    return `data:text/plain;base64,${encodeTextBase64(pipelineInput)}`
  }, [state.mode, pipelineInput, output.error])

  // Unified image source: file encode takes priority
  const activeImage = droppedFile?.dataUri ?? imagePreview

  // The Base64 payload alone, honouring the URL-safe option. The data URI keeps standard
  // alphabet + padding because that is what `data:` consumers require.
  const fileBase64 = useMemo(() => {
    const payload = droppedFile?.dataUri.split(',')[1] ?? ''
    return state.urlSafe ? toUrlSafeBase64(payload) : payload
  }, [droppedFile, state.urlSafe])

  const handleSwap = useCallback(() => {
    if (output.text && pipelineInput === state.input) {
      updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' })
      setLastAction('Swapped', 'info')
    }
  }, [output.text, pipelineInput, state.input, state.mode, updateState, setLastAction])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  const handleSaveDecoded = useCallback(() => {
    if (!output.bytes || !output.mimeType) return
    const extension =
      output.mimeType === 'image/png'
        ? 'png'
        : output.mimeType === 'image/jpeg'
          ? 'jpg'
          : output.mimeType === 'image/gif'
            ? 'gif'
            : output.mimeType.startsWith('text/')
              ? 'txt'
              : 'bin'
    const blob = new Blob([Uint8Array.from(output.bytes)], { type: output.mimeType })
    void exportFile(blob, `decoded.${extension}`).then(
      (path) => setLastAction(path ? `Saved ${path}` : 'Save cancelled', path ? 'success' : 'info'),
      (error: unknown) =>
        setLastAction(
          `Save failed: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
    )
  }, [output.bytes, output.mimeType, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap)

  useEffect(() => {
    if (pipelineInput.trim() && output.text && !output.error) {
      record({
        input: `${state.mode === 'encode' ? 'Encode' : 'Decode'}: ${pipelineInput.slice(0, 500)}${pipelineInput.length > 500 ? '...' : ''}`,
        output: output.text.slice(0, 1000),
        subTab: state.mode,
        success: true,
      })
    }
  }, [pipelineInput, state.mode, output.text, output.error, record])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <ToolLayout
      fullBleed
      toolbar={
        <Toolbar aria-label="Base64 conversion actions">
          <ToolbarGroup label="Conversion actions">
            <Button variant="primary" size="sm" onClick={handleToggle}>
              {state.mode === 'decode' && <ArrowLeftIcon size={12} aria-hidden="true" />}
              {state.mode === 'encode' ? 'Encode' : 'Decode'}
              {state.mode === 'encode' && <ArrowRightIcon size={12} aria-hidden="true" />}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSwap} disabled={!output.text}>
              <ArrowsLeftRightIcon size={12} aria-hidden="true" />
              Swap
            </Button>
            <Kbd keys="mod+enter" />
          </ToolbarGroup>

          <ToolbarGroup label="Encoding options" separated>
            <Toggle
              checked={state.urlSafe}
              onChange={(urlSafe) => updateState({ urlSafe })}
              label="URL-safe"
            />
            {state.mode === 'encode' && !droppedFile && (
              <Toggle
                checked={state.lineWrap}
                onChange={(lineWrap) => updateState({ lineWrap })}
                label="Wrap 76"
              />
            )}

            {autoDetect && !droppedFile && (
              <StatusBadge variant="success">Valid Base64</StatusBadge>
            )}
          </ToolbarGroup>

          <ToolbarSpacer />
          <div className="flex items-center gap-2 text-2xs tabular-nums text-[var(--color-text-muted)]">
            {!droppedFile && state.input.trim() && (
              <>
                <span>{formatBytes(inputBytes)}</span>
                <span>→</span>
                <span>{formatBytes(outputBytes)}</span>
                {ratio && <span>({ratio}×)</span>}
              </>
            )}
            {droppedFile && (
              <span>
                {formatBytes(droppedFile.size)} → {formatBytes(droppedFile.dataUri.length)}
              </span>
            )}
          </div>
        </Toolbar>
      }
    >
      {/* ── Panels ────────────────────────────────────────────────── */}
      <SplitPane storageKey="base64" aria-label="Resize input and output">
        {/* ── Input panel ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <PaneHeader
            title="Input"
            hint={state.mode === 'encode' ? 'Text' : 'Base64'}
            actions={
              <>
                {state.mode === 'encode' && !droppedFile && (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => fileInputRef.current?.click()}
                      title="Encode a file to Base64"
                      className="gap-1"
                    >
                      <UploadSimpleIcon size={12} />
                      Encode File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                  </>
                )}
                {droppedFile && (
                  <Button
                    variant="icon"
                    size="xs"
                    onClick={() => setDroppedFile(null)}
                    title="Clear file"
                    className="hover:text-[var(--color-error)]"
                  >
                    <XIcon size={12} />
                  </Button>
                )}
              </>
            }
          />

          {droppedFile ? (
            /* File info view */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <FileIcon size={36} className="text-[var(--color-text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {droppedFile.name}
                </div>
                <div className="mt-0.5 text-2xs text-[var(--color-text-muted)]">
                  {formatBytes(droppedFile.size)}
                  {droppedFile.mimeType ? ` · ${droppedFile.mimeType}` : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <UploadSimpleIcon size={12} />
                Drop another file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          ) : (
            /* Text input + drag-drop zone */
            <div
              className="relative flex flex-1 flex-col"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <TextArea
                value={state.input}
                onChange={(e) => updateState({ input: e.target.value })}
                placeholder={
                  state.mode === 'encode'
                    ? 'Enter text to encode, or drop a file…'
                    : 'Enter Base64 to decode (data URIs supported)…'
                }
                monospace
                size="md"
                className="flex-1 resize-none rounded-none border-0 bg-[var(--color-bg)] p-4 focus:border-0"
              />
              {isDragOver && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--color-surface)]/90 backdrop-blur-sm">
                  <UploadSimpleIcon size={28} className="text-[var(--color-accent)]" />
                  <span className="text-sm font-medium text-[var(--color-accent)]">
                    Drop to encode as Base64
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Output panel ────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <PaneHeader
            title="Output"
            hint={droppedFile ? 'Base64 Data URI' : state.mode === 'encode' ? 'Base64' : 'Text'}
            actions={
              droppedFile ? (
                <>
                  <CopyButton text={fileBase64} label="Copy Base64" />
                  <CopyButton text={droppedFile.dataUri} label="Copy data URI" />
                </>
              ) : (
                <>
                  {dataUri && state.mode === 'encode' && (
                    <CopyButton text={dataUri} label="Copy data URI" />
                  )}
                  <CopyButton text={output.text} />
                  {state.mode === 'decode' && output.bytes && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleSaveDecoded}
                      title={`Save decoded bytes (${output.mimeType ?? 'application/octet-stream'})`}
                    >
                      <DownloadSimpleIcon size={14} aria-hidden="true" />
                      Save file
                    </Button>
                  )}
                </>
              )
            }
          />

          {droppedFile ? (
            /* File encode output: base64 text (truncated) + zoomable image */
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Compact base64 preview */}
              <pre className="max-h-20 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-2xs text-[var(--color-text-muted)]">
                {fileBase64.slice(0, 200)}
                <span>…</span>
              </pre>
              {/* Zoomable image or file placeholder */}
              {droppedFile.mimeType.startsWith('image/') ? (
                <div
                  ref={imgViewRef}
                  className="relative flex-1 cursor-grab overflow-hidden bg-[var(--color-surface)] select-none active:cursor-grabbing"
                  onMouseDown={handleImgMouseDown}
                  onMouseMove={handleImgMouseMove}
                  onMouseUp={handleImgMouseUp}
                  onMouseLeave={handleImgMouseLeave}
                  onDoubleClick={resetImgView}
                >
                  <div
                    style={{
                      transform: `translate(${imgTransform.x}px, ${imgTransform.y}px) scale(${imgTransform.scale})`,
                      transformOrigin: '0 0',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1rem',
                      pointerEvents: 'none',
                    }}
                  >
                    <img
                      src={droppedFile.dataUri}
                      alt={droppedFile.name}
                      className="max-h-full max-w-full rounded"
                      draggable={false}
                    />
                  </div>
                  <ZoomBadge
                    scale={imgTransform.scale}
                    isDefault={isImgViewDefault}
                    onReset={resetImgView}
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
                  <div className="text-center">
                    <FileIcon size={32} className="mx-auto mb-2 opacity-30" />
                    <div>Binary file — use Copy Base64 or Copy data URI</div>
                  </div>
                </div>
              )}
            </div>
          ) : output.error ? (
            <Alert variant="error" className="m-4">
              {output.error}
            </Alert>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Text output — shrinks when image is present */}
              <pre
                className={`whitespace-pre-wrap break-all p-4 font-mono text-sm text-[var(--color-text)] ${activeImage ? 'max-h-24 overflow-auto border-b border-[var(--color-border)]' : 'flex-1 overflow-auto'}`}
              >
                {output.text}
              </pre>
              {/* Zoomable image preview (decode mode) */}
              {imagePreview && (
                <div
                  ref={imgViewRef}
                  className="relative flex-1 cursor-grab overflow-hidden bg-[var(--color-surface)] select-none active:cursor-grabbing"
                  onMouseDown={handleImgMouseDown}
                  onMouseMove={handleImgMouseMove}
                  onMouseUp={handleImgMouseUp}
                  onMouseLeave={handleImgMouseLeave}
                  onDoubleClick={resetImgView}
                >
                  <div
                    style={{
                      transform: `translate(${imgTransform.x}px, ${imgTransform.y}px) scale(${imgTransform.scale})`,
                      transformOrigin: '0 0',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1rem',
                      pointerEvents: 'none',
                    }}
                  >
                    <img
                      src={imagePreview}
                      alt="Decoded preview"
                      className="max-h-full max-w-full rounded"
                      draggable={false}
                    />
                  </div>
                  <ZoomBadge
                    scale={imgTransform.scale}
                    isDefault={isImgViewDefault}
                    onReset={resetImgView}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </SplitPane>
    </ToolLayout>
  )
}

// ── ZoomBadge ──────────────────────────────────────────────────────

function ZoomBadge({
  scale,
  isDefault,
  onReset,
}: {
  scale: number
  isDefault: boolean
  onReset: () => void
}) {
  return (
    <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 font-mono text-2xs text-[var(--color-text-muted)]">
      <span>{Math.round(scale * 100)}%</span>
      {!isDefault && (
        <Button
          variant="icon"
          size="xs"
          className="pointer-events-auto ml-0.5 p-0 hover:bg-transparent hover:text-[var(--color-text)]"
          title="Reset view"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onReset()
          }}
        >
          <ArrowCounterClockwiseIcon size={12} aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
