import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { Alert } from '@/components/shared/Alert'
import { useUiStore } from '@/stores/ui.store'
import { useKeyboardShortcut } from '@/hooks/useKeyboardShortcut'
import { Button } from '@/components/shared/Button'
import { UploadSimpleIcon, FileIcon, XIcon } from '@phosphor-icons/react'

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

// ── Helpers ────────────────────────────────────────────────────────

function isValidBase64(str: string): boolean {
  if (!str.trim()) return false
  try {
    return btoa(atob(str)) === str.replace(/\s/g, '')
  } catch {
    return false
  }
}

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromUrlSafe(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return s
}

function wrapLines(str: string, width: number): string {
  const lines: string[] = []
  for (let i = 0; i < str.length; i += width) {
    lines.push(str.slice(i, i + width))
  }
  return lines.join('\n')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
      try {
        const dataUri = await readFileAsDataUrl(file)
        setDroppedFile({ name: file.name, dataUri, mimeType: file.type ?? '', size: file.size })
        setImgTransform(DEFAULT_IMG_TRANSFORM)
        setLastAction(`Encoded "${file.name}"`, 'success')
        record({
          input: `Encode file: ${file.name} (${formatSize(file.size)})`,
          output: `${file.type};base64 [${formatSize(dataUri.length)}]`,
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

  const output = useMemo(() => {
    if (!state.input.trim()) return { text: '', error: null }
    try {
      if (state.mode === 'encode') {
        const bytes = new TextEncoder().encode(state.input)
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        let encoded = btoa(binary)
        if (state.urlSafe) encoded = toUrlSafe(encoded)
        if (state.lineWrap) encoded = wrapLines(encoded, 76)
        return { text: encoded, error: null }
      } else {
        let toDecode = state.input.replace(/\s/g, '')
        const dataUriMatch = toDecode.match(/^data:[^;]*;base64,(.*)$/)
        if (dataUriMatch?.[1]) toDecode = dataUriMatch[1]
        if (state.urlSafe) toDecode = fromUrlSafe(toDecode)
        const decoded = Uint8Array.from(atob(toDecode), (c) => c.charCodeAt(0))
        return { text: new TextDecoder().decode(decoded), error: null }
      }
    } catch (e) {
      return { text: '', error: (e as Error).message }
    }
  }, [state.input, state.mode, state.urlSafe, state.lineWrap])

  const autoDetect = useMemo(() => {
    if (!state.input.trim()) return null
    return isValidBase64(state.input.replace(/\s/g, ''))
  }, [state.input])

  const inputBytes = useMemo(() => new TextEncoder().encode(state.input).length, [state.input])
  const outputBytes = useMemo(
    () => (output.text ? new TextEncoder().encode(output.text).length : 0),
    [output.text]
  )
  const ratio = useMemo(() => {
    if (!inputBytes || !outputBytes) return null
    if (state.mode === 'encode') return (outputBytes / inputBytes).toFixed(2)
    return (inputBytes / outputBytes).toFixed(2)
  }, [inputBytes, outputBytes, state.mode])

  // Image preview (decode mode: detect image in base64 input)
  const imagePreview = useMemo(() => {
    if (state.mode !== 'decode' || !state.input.trim()) return null
    const clean = state.input.replace(/\s/g, '')
    const dataUriMatch = clean.match(/^data:(image\/[^;]+);base64,(.*)$/)
    if (dataUriMatch) return clean
    const mime = detectImageMime(clean)
    if (mime) return `data:${mime};base64,${clean}`
    return null
  }, [state.mode, state.input])

  // Data URI builder for text encode output
  const dataUri = useMemo(() => {
    if (state.mode !== 'encode' || !output.text) return null
    const raw = output.text.replace(/\n/g, '')
    return `data:text/plain;base64,${raw}`
  }, [state.mode, output.text])

  // Unified image source: file encode takes priority
  const activeImage = droppedFile?.dataUri ?? imagePreview

  const handleSwap = useCallback(() => {
    if (output.text) {
      updateState({ input: output.text, mode: state.mode === 'encode' ? 'decode' : 'encode' })
      setLastAction('Swapped', 'info')
    }
  }, [output.text, state.mode, updateState, setLastAction])

  const handleToggle = useCallback(() => {
    updateState({ mode: state.mode === 'encode' ? 'decode' : 'encode' })
    setLastAction(state.mode === 'encode' ? 'Decode mode' : 'Encode mode', 'info')
  }, [state.mode, updateState, setLastAction])

  useKeyboardShortcut({ key: 'Enter', mod: true }, handleSwap)

  useEffect(() => {
    if (state.input.trim() && output.text && !output.error) {
      record({
        input: `${state.mode === 'encode' ? 'Encode' : 'Decode'}: ${state.input.slice(0, 500)}${state.input.length > 500 ? '...' : ''}`,
        output: output.text.slice(0, 1000),
        subTab: state.mode,
        success: true,
      })
    }
  }, [state.input, state.mode, output.text, output.error, record])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-2">
        <Button variant="primary" size="sm" onClick={handleToggle}>
          {state.mode === 'encode' ? 'Encode →' : '← Decode'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSwap} disabled={!output.text}>
          ⇄ Swap
        </Button>
        <span className="text-[10px] text-[var(--color-text-muted)]">⌘↵</span>

        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={state.urlSafe}
            onChange={(e) => updateState({ urlSafe: e.target.checked })}
            className="accent-[var(--color-accent)]"
          />
          URL-safe
        </label>
        {state.mode === 'encode' && !droppedFile && (
          <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={state.lineWrap}
              onChange={(e) => updateState({ lineWrap: e.target.checked })}
              className="accent-[var(--color-accent)]"
            />
            Wrap 76
          </label>
        )}

        {autoDetect && !droppedFile && (
          <span className="text-xs text-[var(--color-success)]">✓ Valid Base64</span>
        )}

        <div className="ml-auto flex items-center gap-2 text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {!droppedFile && state.input.trim() && (
            <>
              <span>{formatSize(inputBytes)}</span>
              <span>→</span>
              <span>{formatSize(outputBytes)}</span>
              {ratio && <span>({ratio}×)</span>}
            </>
          )}
          {droppedFile && (
            <span>
              {formatSize(droppedFile.size)} → {formatSize(droppedFile.dataUri.length)}
            </span>
          )}
        </div>
      </div>

      {/* ── Panels ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Input panel ─────────────────────────────────────────── */}
        <div className="flex w-1/2 flex-col border-r border-[var(--color-border)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              Input ({state.mode === 'encode' ? 'Text' : 'Base64'})
            </span>
            {state.mode === 'encode' && !droppedFile && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Encode a file to Base64"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  <UploadSimpleIcon size={11} />
                  Encode File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </>
            )}
            {droppedFile && (
              <button
                onClick={() => setDroppedFile(null)}
                title="Clear file"
                className="rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-error)]"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>

          {droppedFile ? (
            /* File info view */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <FileIcon size={36} className="text-[var(--color-text-muted)] opacity-50" />
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {droppedFile.name}
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                  {formatSize(droppedFile.size)}
                  {droppedFile.mimeType ? ` · ${droppedFile.mimeType}` : ''}
                </div>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <UploadSimpleIcon size={12} />
                Drop another file
              </button>
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
              <textarea
                value={state.input}
                onChange={(e) => updateState({ input: e.target.value })}
                placeholder={
                  state.mode === 'encode'
                    ? 'Enter text to encode, or drop a file…'
                    : 'Enter Base64 to decode (data URIs supported)…'
                }
                className="flex-1 resize-none border-none bg-[var(--color-bg)] p-4 font-mono text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none"
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
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1">
            <span className="text-xs text-[var(--color-text-muted)]">
              {droppedFile
                ? 'Output (Base64 Data URI)'
                : `Output (${state.mode === 'encode' ? 'Base64' : 'Text'})`}
            </span>
            <div className="flex items-center gap-1">
              {droppedFile ? (
                <>
                  <CopyButton text={droppedFile.dataUri.split(',')[1] ?? ''} label="Copy Base64" />
                  <CopyButton text={droppedFile.dataUri} label="Copy data URI" />
                </>
              ) : (
                <>
                  {dataUri && state.mode === 'encode' && (
                    <CopyButton text={dataUri} label="Copy data URI" />
                  )}
                  <CopyButton text={output.text} />
                </>
              )}
            </div>
          </div>

          {droppedFile ? (
            /* File encode output: base64 text (truncated) + zoomable image */
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Compact base64 preview */}
              <pre className="max-h-20 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-bg)] p-3 font-mono text-[10px] text-[var(--color-text-muted)]">
                {droppedFile.dataUri.split(',')[1]?.slice(0, 200) ?? ''}
                <span className="text-[var(--color-text-muted)] opacity-50">…</span>
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
      </div>
    </div>
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
    <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-[var(--color-surface-hover)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
      <span>{Math.round(scale * 100)}%</span>
      {!isDefault && (
        <button
          className="pointer-events-auto ml-0.5 hover:text-[var(--color-text)]"
          title="Reset view"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onReset()
          }}
        >
          ↺
        </button>
      )}
    </div>
  )
}
