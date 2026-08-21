import { useEffect, useId, useRef, useState, useCallback, useMemo } from 'react'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { CopyButton } from '@/components/shared/CopyButton'
import { ToolLayout } from '@/components/shared/ToolLayout'
import { EmptyState } from '@/components/shared/EmptyState'
import { Field } from '@/components/shared/Field'
import { Input } from '@/components/shared/Input'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TextArea } from '@/components/shared/TextArea'
import { Toggle } from '@/components/shared/Toggle'
import { Button } from '@/components/shared/Button'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Alert } from '@/components/shared/Alert'
import {
  CheckCircleIcon,
  HashIcon,
  UploadSimpleIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  computeFileHashes,
  computeFileHmac,
  computeHashes,
  computeHmac,
  HASH_ALGORITHMS,
  parseChecksumFile,
  type Hashes,
} from '@/tools/hash-generator/hash-utils'
import { formatBytes } from '@/lib/format'

type HashSource = 'text' | 'file'

type HashGeneratorState = {
  input: string
  compareHash: string
  checksumText: string
  uppercase: boolean
  hmacMode: boolean
  hmacKey: string
  /**
   * Which input the tool is showing. The file itself is *not* persisted — a `File` handle cannot
   * survive a reload — so a restored session returns to the drop zone with the source still set to
   * `file`, which is the honest state rather than silently reverting to text.
   */
  source: HashSource
}

const SOURCE_OPTIONS = [
  { value: 'text' as const, label: 'Text' },
  { value: 'file' as const, label: 'File' },
]

export default function HashGenerator() {
  const compareId = useId()
  const [state, updateState] = useToolState<HashGeneratorState>('hash-generator', {
    input: '',
    compareHash: '',
    checksumText: '',
    uppercase: false,
    hmacMode: false,
    hmacKey: '',
    source: 'text',
  })
  const { record } = useToolHistory({ toolId: 'hash-generator' })
  const [hashes, setHashes] = useState<Hashes | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── File source ────────────────────────────────────────────────
  const [file, setFile] = useState<{ name: string; size: number } | null>(null)
  const [fileProgress, setFileProgress] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const isFileSource = state.source === 'file'

  const processFile = useCallback(
    (picked: File) => {
      // Dropping a second file while the first is still going is easy to do, and without this the
      // two runs race to set the same result — with the slower, older one winning.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setFile({ name: picked.name, size: picked.size })
      setFileError(null)
      setHashes(null)
      setFileProgress(0)
      setIsComputing(true)

      const fileOptions = {
        signal: controller.signal,
        onProgress: ({ loaded, total }: { loaded: number; total: number }) => {
          if (!controller.signal.aborted) setFileProgress(total === 0 ? 1 : loaded / total)
        },
      }
      const filePromise =
        state.hmacMode && state.hmacKey
          ? computeFileHmac(picked, state.hmacKey, fileOptions)
          : computeFileHashes(picked, fileOptions)
      filePromise
        .then((result) => {
          if (controller.signal.aborted) return
          setHashes(result)
          setIsComputing(false)
          setFileProgress(null)
          record({
            input: `${picked.name} (${formatBytes(picked.size)})`,
            output: result.sha256.slice(0, 500),
            subTab: 'file',
            success: true,
          })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setIsComputing(false)
          setFileProgress(null)
          setFileError(error instanceof Error ? error.message : String(error))
        })
    },
    [record, state.hmacKey, state.hmacMode]
  )

  const clearFile = useCallback(() => {
    abortRef.current?.abort()
    setFile(null)
    setFileProgress(null)
    setFileError(null)
    setHashes(null)
    setIsComputing(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) processFile(dropped)
    },
    [processFile]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked) processFile(picked)
      e.target.value = '' // allow re-selecting the same file
    },
    [processFile]
  )

  // Abort an in-flight hash when the tool unmounts, so a closed tab stops burning CPU on a file
  // nobody is waiting for.
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * Switching source clears the digests as well as the selection.
   *
   * Without this, flipping Text → File left the text's hashes on screen above an empty drop zone —
   * seven digests presented as belonging to a file that had not been chosen yet.
   */
  const handleSourceChange = useCallback(
    (source: HashSource) => {
      abortRef.current?.abort()
      setFile(null)
      setFileProgress(null)
      setFileError(null)
      setHashes(null)
      setIsComputing(false)
      updateState({ source })
    },
    [updateState]
  )

  const runCompute = useCallback(
    (input: string) => {
      setIsComputing(true)
      const fn =
        state.hmacMode && state.hmacKey ? computeHmac(input, state.hmacKey) : computeHashes(input)
      fn.then((result) => {
        setHashes(result)
        setIsComputing(false)
      }).catch(() => {
        setHashes(null)
        setIsComputing(false)
      })
    },
    [state.hmacMode, state.hmacKey]
  )

  useEffect(() => {
    // The text pipeline is inert while the file source is showing. Without this guard, switching to
    // File and back would re-run the debounce and overwrite the file digest with the stale textarea
    // contents.
    if (isFileSource) return
    if (!state.input) {
      setHashes(null)
      setIsComputing(false)
      return
    }
    setIsComputing(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runCompute(state.input)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [state.input, runCompute, isFileSource])

  useEffect(() => {
    // File runs record their own entry with the filename, so this only covers the text path.
    if (isFileSource) return
    if (hashes && !isComputing) {
      record({
        input: state.input.slice(0, 300),
        output: hashes.sha256.slice(0, 500),
        subTab: state.hmacMode ? 'hmac' : 'standard',
        success: true,
      })
    }
  }, [hashes, isComputing, state.input, state.hmacMode, record, isFileSource])

  const applyCase = useCallback(
    (v: string) => (state.uppercase ? v.toUpperCase() : v),
    [state.uppercase]
  )

  const hashList = useMemo(
    () => (hashes ? HASH_ALGORITHMS.map((algo) => ({ ...algo, value: hashes[algo.key] })) : []),
    [hashes]
  )

  // Compare logic
  const compareNormalized = state.compareHash.trim().toLowerCase()
  const matchedAlgo = useMemo(() => {
    if (!compareNormalized || !hashes) return null
    for (const h of hashList) {
      if (h.value.toLowerCase() === compareNormalized) return h.label
    }
    return null
  }, [compareNormalized, hashes, hashList])
  const checksumExpected = useMemo(
    () => parseChecksumFile(state.checksumText, file?.name),
    [file?.name, state.checksumText]
  )
  const checksumMatch = useMemo(
    () =>
      checksumExpected
        ? (hashList.find((hash) => hash.value.toLowerCase() === checksumExpected)?.label ?? null)
        : null,
    [checksumExpected, hashList]
  )

  const inputBytes = useMemo(() => new TextEncoder().encode(state.input).length, [state.input])

  return (
    <ToolLayout>
      {/* The form lives in the body, not the `toolbar` slot. A toolbar is a row of controls
          acting on the content below it; this is the content. */}
      <div className="mb-4 flex flex-col gap-3">
        <SegmentedControl
          options={SOURCE_OPTIONS}
          value={state.source}
          onChange={handleSourceChange}
          aria-label="Hash source"
          className="self-start"
        />

        {isFileSource ? (
          <Field
            label="File"
            hint={
              file ? (
                <span className="tabular-nums">
                  {formatBytes(file.size)}
                  {fileProgress !== null && ` · ${Math.round(fileProgress * 100)}% hashed`}
                </span>
              ) : (
                'Hashed in 4 MiB chunks — the file is never held in memory whole.'
              )
            }
          >
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed p-6 transition-colors duration-[var(--duration-fast)] ${
                isDragOver
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]/30'
                  : 'border-[var(--color-border)]'
              }`}
            >
              {file ? (
                <>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs text-[var(--color-text)]">
                      {file.name}
                    </span>
                    <Button
                      variant="icon"
                      size="sm"
                      onClick={clearFile}
                      aria-label={`Clear ${file.name}`}
                    >
                      <XIcon size={12} aria-hidden="true" />
                    </Button>
                  </div>
                  {/* A determinate bar rather than a spinner: hashing a large artefact is a job
                      long enough that "still going" is not enough information. */}
                  {fileProgress !== null && (
                    <div
                      role="progressbar"
                      aria-label={`Hashing ${file.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(fileProgress * 100)}
                      className="h-1 w-48 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]"
                    >
                      <div
                        className="h-full bg-[var(--color-accent)] transition-[width] duration-[var(--duration-fast)]"
                        style={{ width: `${fileProgress * 100}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <UploadSimpleIcon
                    size={16}
                    aria-hidden="true"
                    className="text-[var(--color-text-muted)]"
                  />
                  <span className="text-xs text-[var(--color-text-muted)]">
                    Drop a file here, or
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                aria-label="Choose a file to hash"
                onChange={handleFileInputChange}
              />
            </div>
          </Field>
        ) : (
          <Field
            label="Input"
            hint={
              state.input && (
                <span className="tabular-nums">
                  {formatBytes(inputBytes)} · {state.input.length} chars
                  {isComputing && ' · Computing…'}
                </span>
              )
            }
          >
            <TextArea
              value={state.input}
              onChange={(e) => updateState({ input: e.target.value })}
              placeholder="Enter text to hash..."
              rows={4}
              size="md"
              className="resize-none"
            />
          </Field>
        )}

        {fileError && <Alert variant="error">Could not hash that file: {fileError}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <Toggle
            checked={state.uppercase}
            onChange={(uppercase) => updateState({ uppercase })}
            label="Uppercase"
          />
          <Toggle
            checked={state.hmacMode}
            onChange={(hmacMode) => updateState({ hmacMode })}
            label="HMAC"
          />
          {state.hmacMode && (
            <Input
              value={state.hmacKey}
              onChange={(e) => updateState({ hmacKey: e.target.value })}
              placeholder="Secret key..."
              aria-label="HMAC secret key"
              className="flex-1 font-mono"
            />
          )}
        </div>

        {/* htmlFor, not a wrapping label: the badge beside the input is labelable in some
            browsers, and a wrapping label would forward clicks to whichever comes first. */}
        <Field label="Compare hash" htmlFor={compareId}>
          <div className="flex items-center gap-2">
            <Input
              id={compareId}
              value={state.compareHash}
              onChange={(e) => updateState({ compareHash: e.target.value })}
              placeholder="Paste a hash to compare..."
              className="flex-1 font-mono"
            />
            {compareNormalized && hashes && (
              <StatusBadge variant={matchedAlgo ? 'success' : 'error'}>
                {matchedAlgo ? (
                  <CheckCircleIcon size={12} weight="fill" aria-hidden="true" />
                ) : (
                  <XCircleIcon size={12} weight="fill" aria-hidden="true" />
                )}
                {matchedAlgo ? `Matches ${matchedAlgo}` : 'No match'}
              </StatusBadge>
            )}
          </div>
        </Field>
        <Field label="Verify checksum file">
          <TextArea
            value={state.checksumText}
            onChange={(e) => updateState({ checksumText: e.target.value })}
            placeholder="Paste a checksum file line, e.g. <hash>  filename.iso"
            rows={2}
            size="sm"
            className="resize-none font-mono"
          />
          {state.checksumText.trim() && (
            <p
              className={`mt-1 text-2xs ${checksumMatch ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}
            >
              {checksumMatch
                ? `Checksum matches ${checksumMatch}`
                : checksumExpected
                  ? 'Checksum does not match'
                  : 'No supported checksum line found'}
            </p>
          )}
        </Field>
      </div>

      {hashList.length > 0 ? (
        <div className="flex flex-col gap-3">
          {hashList.map((h) => {
            const displayValue = applyCase(h.value)
            const isMatch = compareNormalized && h.value.toLowerCase() === compareNormalized
            return (
              <div
                key={h.label}
                // A bare `border` resolves to `currentColor` under Tailwind v4's preflight
                // (`border: 0 solid`, no colour set), so the unmatched rows were drawing a
                // text-coloured outline instead of `--color-border`. Same shape as the
                // CaseConverter fix; the colour is picked inside the ternary rather than listed
                // beside the success variant, because two arbitrary border-colour utilities have
                // equal specificity and the winner is generation order, not string order.
                className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 ${
                  isMatch
                    ? 'border-[var(--color-success)] bg-[var(--color-success)]/10'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">
                      {state.hmacMode && state.hmacKey ? `HMAC-${h.label}` : h.label}
                    </span>
                    <span className="text-2xs text-[var(--color-text-muted)]">{h.bits}-bit</span>
                    {h.note && <StatusBadge variant="warning">{h.note}</StatusBadge>}
                    {isMatch && <StatusBadge variant="success">Match</StatusBadge>}
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--color-text)]">
                    {displayValue}
                  </div>
                </div>
                <CopyButton text={displayValue} className="ml-2 shrink-0" label="Copy" />
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={HashIcon}
          title={
            isFileSource ? 'Drop a file above to see its hashes' : 'Enter text above to see hashes'
          }
          size="sm"
          className="p-0"
        />
      )}
    </ToolLayout>
  )
}
