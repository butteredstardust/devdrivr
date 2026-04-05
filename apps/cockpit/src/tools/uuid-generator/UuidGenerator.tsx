import { useCallback, useMemo, useState, useEffect } from 'react'
import { CopyButton } from '@/components/shared/CopyButton'
import { useToolState } from '@/hooks/useToolState'
import { useToolHistory } from '@/hooks/useToolHistory'
import { useUiStore } from '@/stores/ui.store'
import { Button } from '@/components/shared/Button'
import { Input, Select } from '@/components/shared/Input'

// ── UUID Generation ──────────────────────────────────────────────────

function generateV4(): string {
  return crypto.randomUUID()
}

function generateV1(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // Timestamp: 100ns intervals since 1582-10-15
  const now = BigInt(Date.now()) * 10000n + 122192928000000000n
  const timeLow = Number(now & 0xffffffffn)
  const timeMid = Number((now >> 32n) & 0xffffn)
  const timeHi = Number((now >> 48n) & 0x0fffn) | 0x1000 // version 1

  bytes[0] = (timeLow >>> 24) & 0xff
  bytes[1] = (timeLow >>> 16) & 0xff
  bytes[2] = (timeLow >>> 8) & 0xff
  bytes[3] = timeLow & 0xff
  bytes[4] = (timeMid >>> 8) & 0xff
  bytes[5] = timeMid & 0xff
  bytes[6] = (timeHi >>> 8) & 0xff
  bytes[7] = timeHi & 0xff

  // Variant bits (RFC 4122)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  return formatUuid(bytes)
}

function generateV7(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // 48-bit unix timestamp in ms
  const now = Date.now()
  bytes[0] = (now / 2 ** 40) & 0xff
  bytes[1] = (now / 2 ** 32) & 0xff
  bytes[2] = (now / 2 ** 24) & 0xff
  bytes[3] = (now / 2 ** 16) & 0xff
  bytes[4] = (now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff

  // Version 7
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  // Variant bits
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  return formatUuid(bytes)
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const GENERATORS: Record<UuidVersion, () => string> = {
  v1: generateV1,
  v4: generateV4,
  v7: generateV7,
}

// ── UUID Parsing & Validation ────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

type UuidInfo = {
  valid: true
  version: number
  variant: string
  timestamp?: string
  node?: string
}

function parseUuid(input: string): UuidInfo | { valid: false; message: string } {
  const trimmed = input.trim()
  if (!UUID_REGEX.test(trimmed)) {
    return { valid: false, message: 'Not a valid UUID format' }
  }

  if (trimmed === NIL_UUID) {
    return { valid: true, version: 0, variant: 'Nil UUID' }
  }
  if (trimmed.toLowerCase() === MAX_UUID) {
    return { valid: true, version: 0, variant: 'Max UUID' }
  }

  const hex = trimmed.replace(/-/g, '')
  const versionNibble = parseInt(hex[12]!, 16)
  const variantNibble = parseInt(hex[16]!, 16)

  const variant =
    (variantNibble & 0x8) === 0
      ? 'NCS (reserved)'
      : (variantNibble & 0xc) === 0x8
        ? 'RFC 4122'
        : (variantNibble & 0xe) === 0xc
          ? 'Microsoft (reserved)'
          : 'Future (reserved)'

  const info: UuidInfo = { valid: true, version: versionNibble, variant }

  // Extract timestamp for v1
  if (versionNibble === 1) {
    const timeHi = hex.slice(12, 16).replace(/^1/, '')
    const timeMid = hex.slice(8, 12)
    const timeLow = hex.slice(0, 8)
    const timestamp100ns = BigInt(`0x${timeHi}${timeMid}${timeLow}`)
    const unixMs = Number((timestamp100ns - 122192928000000000n) / 10000n)
    if (unixMs > 0 && unixMs < 4102444800000) {
      info.timestamp = new Date(unixMs).toISOString()
    }
    info.node = hex.slice(20).match(/.{2}/g)!.join(':')
  }

  // Extract timestamp for v7
  if (versionNibble === 7) {
    const timestampHex = hex.slice(0, 12)
    const unixMs = parseInt(timestampHex, 16)
    if (unixMs > 0 && unixMs < 4102444800000) {
      info.timestamp = new Date(unixMs).toISOString()
    }
  }

  return info
}

// ── Component ────────────────────────────────────────────────────────

type UuidVersion = 'v1' | 'v4' | 'v7'
type BulkFormat = 'lines' | 'json' | 'csv'

type UuidState = {
  lastGenerated: string
  bulkCount: number
  validateInput: string
  version: UuidVersion
  bulkFormat: BulkFormat
}

const VERSION_LABELS: Record<UuidVersion, string> = {
  v1: 'v1 — Time-based',
  v4: 'v4 — Random',
  v7: 'v7 — Time-ordered',
}

export default function UuidGenerator() {
  const [state, updateState] = useToolState<UuidState>('uuid-generator', {
    lastGenerated: '',
    bulkCount: 10,
    validateInput: '',
    version: 'v4',
    bulkFormat: 'lines',
  })
  const { record } = useToolHistory({ toolId: 'uuid-generator' })

  const [bulkUuids, setBulkUuids] = useState<string[]>([])
  const setLastAction = useUiStore((s) => s.setLastAction)

  const generate = useCallback(() => {
    const uuid = GENERATORS[state.version]()
    updateState({ lastGenerated: uuid })
    setLastAction(`Generated UUID ${state.version}`, 'success')
  }, [state.version, updateState, setLastAction])

  const generateBulk = useCallback(() => {
    const count = Math.min(Math.max(1, state.bulkCount), 100)
    const gen = GENERATORS[state.version]
    const uuids = Array.from({ length: count }, () => gen())
    setBulkUuids(uuids)
    setLastAction(`Generated ${count} UUIDs (${state.version})`, 'success')
  }, [state.bulkCount, state.version, setLastAction])

  const bulkOutput = useMemo(() => {
    if (bulkUuids.length === 0) return ''
    switch (state.bulkFormat) {
      case 'json':
        return JSON.stringify(bulkUuids, null, 2)
      case 'csv':
        return bulkUuids.join(',')
      default:
        return bulkUuids.join('\n')
    }
  }, [bulkUuids, state.bulkFormat])

  const parsed = useMemo(() => {
    if (!state.validateInput.trim()) return null
    return parseUuid(state.validateInput)
  }, [state.validateInput])

  // Record history when UUID is generated
  useEffect(() => {
    if (state.lastGenerated) {
      record({
        input: `Generate ${state.version}`,
        output: state.lastGenerated,
        subTab: state.version,
        success: true,
      })
    }
  }, [state.lastGenerated, state.version, record])

  // Record history when UUID is validated
  useEffect(() => {
    if (state.validateInput.trim() && parsed) {
      record({
        input: `Validate: ${state.validateInput}`,
        output: parsed.valid
          ? `Valid ${parsed.version === 0 ? parsed.variant : `v${parsed.version}`} (${parsed.variant})`
          : parsed.message,
        subTab: 'validate',
        success: parsed.valid,
      })
    }
  }, [state.validateInput, parsed, record])

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      {/* ── Generate ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Generate</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={state.version}
            onChange={(e) => updateState({ version: e.target.value as UuidVersion })}
          >
            {(Object.keys(VERSION_LABELS) as UuidVersion[]).map((v) => (
              <option key={v} value={v}>
                {VERSION_LABELS[v]}
              </option>
            ))}
          </Select>
          <Button variant="primary" size="md" onClick={generate}>
            Generate UUID
          </Button>
          {state.lastGenerated && (
            <div className="flex items-center gap-2">
              <code className="rounded bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]">
                {state.lastGenerated}
              </code>
              <CopyButton text={state.lastGenerated} />
            </div>
          )}
        </div>
      </section>

      {/* ── Constants ────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Constants</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <code className="rounded bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              {NIL_UUID}
            </code>
            <span className="text-xs text-[var(--color-text-muted)]">Nil</span>
            <CopyButton text={NIL_UUID} />
          </div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
              {MAX_UUID}
            </code>
            <span className="text-xs text-[var(--color-text-muted)]">Max</span>
            <CopyButton text={MAX_UUID} />
          </div>
        </div>
      </section>

      {/* ── Bulk Generate ────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Bulk Generate</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="number"
            min={1}
            max={100}
            value={state.bulkCount}
            onChange={(e) => updateState({ bulkCount: parseInt(e.target.value) || 1 })}
            size="md"
            className="w-20"
          />
          <Select
            value={state.bulkFormat}
            onChange={(e) => updateState({ bulkFormat: e.target.value as BulkFormat })}
          >
            <option value="lines">One per line</option>
            <option value="json">JSON array</option>
            <option value="csv">CSV</option>
          </Select>
          <Button variant="primary" size="md" onClick={generateBulk}>
            Generate
          </Button>
          {bulkUuids.length > 0 && <CopyButton text={bulkOutput} label="Copy All" />}
        </div>
        {bulkOutput && (
          <pre className="max-h-60 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)]">
            {bulkOutput}
          </pre>
        )}
      </section>

      {/* ── Validate & Parse ─────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-pixel text-sm text-[var(--color-text)]">Validate & Parse</h2>
        <Input
          type="text"
          value={state.validateInput}
          onChange={(e) => updateState({ validateInput: e.target.value })}
          placeholder="Paste a UUID to validate and parse..."
          size="md"
          className="w-full max-w-xl font-mono"
        />
        {parsed && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            {parsed.valid ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[var(--color-success)]">✓ Valid UUID</span>
                  <span className="rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-xs text-[var(--color-accent)]">
                    {parsed.version === 0 ? parsed.variant : `Version ${parsed.version}`}
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  {parsed.version > 0 && (
                    <>
                      <span className="text-[var(--color-text-muted)]">Variant</span>
                      <span className="text-[var(--color-text)]">{parsed.variant}</span>
                    </>
                  )}
                  {parsed.timestamp && (
                    <>
                      <span className="text-[var(--color-text-muted)]">Timestamp</span>
                      <span className="text-[var(--color-info)]">{parsed.timestamp}</span>
                    </>
                  )}
                  {parsed.node && (
                    <>
                      <span className="text-[var(--color-text-muted)]">Node</span>
                      <span className="font-mono text-[var(--color-text)]">{parsed.node}</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-[var(--color-error)]">✗ {parsed.message}</span>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
