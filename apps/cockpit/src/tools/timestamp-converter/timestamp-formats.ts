/**
 * Timezone-aware formatting for the timestamp converter.
 *
 * The tool used to read every date through the host's local zone and nothing else, which made it
 * useless for the case it mostly gets opened for: someone on a distributed team looking at a log
 * line written somewhere else. Every function here takes an explicit IANA zone so the answer does
 * not depend on where the machine happens to be.
 */

/** Sentinel for "wherever this machine is", resolved at format time rather than baked in. */
export const LOCAL_ZONE = 'local'

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/** `LOCAL_ZONE` → the host's actual zone; anything else passes through. */
export function resolveZone(zone: string): string {
  return zone === LOCAL_ZONE ? localTimeZone() : zone
}

/**
 * Every zone the runtime knows, or a short curated list if it doesn't say.
 *
 * `Intl.supportedValuesOf` is the only way to ask, and it is recent enough that a fallback is worth
 * having — an empty picker would be a worse regression than a short one.
 */
export function listTimeZones(): string[] {
  try {
    const supported = Intl.supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) return supported
  } catch {
    /* fall through to the curated list */
  }
  return [
    'UTC',
    'America/Los_Angeles',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Bucharest',
    'Africa/Johannesburg',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
}

export type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday, matching `Date.prototype.getDay`. */
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Break an instant into calendar fields *as seen in `zone`*.
 *
 * Done through `formatToParts` rather than arithmetic on the UTC offset because offsets are not
 * constant: any zone with daylight saving changes twice a year, and a converter that got the hour
 * right in January and wrong in July would be worse than one that never claimed to handle zones.
 */
export function zonedParts(date: Date, zone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveZone(zone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date)

  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  // `hour12: false` still yields "24" for midnight in some engines; normalise it to 0.
  const hour = Number(lookup('hour')) % 24

  return {
    year: Number(lookup('year')),
    month: Number(lookup('month')),
    day: Number(lookup('day')),
    hour,
    minute: Number(lookup('minute')),
    second: Number(lookup('second')),
    weekday: WEEKDAY_INDEX[lookup('weekday')] ?? 0,
  }
}

/** `GMT+02:00` → `UTC+02:00`; `GMT` (exactly zero) → `UTC+00:00`. */
export function zoneOffset(date: Date, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolveZone(zone),
      timeZoneName: 'longOffset',
    }).formatToParts(date)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC')
  } catch {
    return 'UTC'
  }
}

/**
 * ISO 8601 week date, `YYYY-Www`.
 *
 * The week-numbering year is not always the calendar year — 2021-01-01 is `2020-W53` — which is the
 * whole reason this is worth a function rather than a template string. Weeks start Monday and week
 * 1 is the one containing the first Thursday, per ISO 8601.
 */
export function isoWeek(date: Date, zone: string): string {
  const { year, month, day } = zonedParts(date, zone)
  // Work in UTC on the *zone's* calendar date, so the arithmetic below can't be perturbed by the
  // host's own offset.
  const utc = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = utc.getUTCDay() || 7 // Monday = 1 … Sunday = 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayOfWeek) // move to the Thursday of this week
  const weekYear = utc.getUTCFullYear()
  const yearStart = Date.UTC(weekYear, 0, 1)
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${weekYear}-W${String(week).padStart(2, '0')}`
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function relativeTime(date: Date, now: number = Date.now()): string {
  const diffMs = now - date.getTime()
  const absDiff = Math.abs(diffMs)
  const suffix = diffMs >= 0 ? 'ago' : 'from now'
  if (absDiff < 60_000) return `${Math.round(absDiff / 1000)} seconds ${suffix}`
  if (absDiff < 3_600_000) return `${Math.round(absDiff / 60_000)} minutes ${suffix}`
  if (absDiff < 86_400_000) return `${(absDiff / 3_600_000).toFixed(1)} hours ${suffix}`
  if (absDiff < 2_592_000_000) return `${Math.round(absDiff / 86_400_000)} days ${suffix}`
  if (absDiff < 31_536_000_000) return `${Math.round(absDiff / 2_592_000_000)} months ${suffix}`
  return `${(absDiff / 31_536_000_000).toFixed(1)} years ${suffix}`
}

/** `2026-08-21 14:07:33` in the target zone — sortable, unambiguous, and paste-safe. */
export function zonedIsoLike(date: Date, zone: string): string {
  const p = zonedParts(date, zone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

/** `YYYY-MM-DDTHH:MM:SS` in `zone` — the value shape a `datetime-local` input wants. */
export function toZonedWallClock(date: Date, zone: string): string {
  const p = zonedParts(date, zone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

/**
 * The inverse: read a wall-clock string *as if written in `zone`*.
 *
 * Solved by iteration rather than a lookup because the offset depends on the instant, and the
 * instant is what we're solving for — near a DST boundary the first guess can be an hour out, and
 * the second pass corrects it. Two passes are enough for every real zone; a third would only
 * matter for an offset that changes within an hour of itself, which does not exist.
 *
 * Returns `null` for unparseable or nonexistent wall times rather than silently normalising them.
 * During a fall-back fold both candidate instants exist; the iteration deterministically keeps the
 * candidate reached from the UTC-shaped initial guess.
 */
export function fromZonedWallClock(value: string, zone: string): Date | null {
  const asUtc = Date.parse(`${value}Z`)
  if (Number.isNaN(asUtc)) return null
  let ts = asUtc
  for (let pass = 0; pass < 2; pass += 1) {
    const p = zonedParts(new Date(ts), zone)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    ts += asUtc - seen
  }
  const result = new Date(ts)
  const requestedWallClock = toZonedWallClock(new Date(asUtc), 'UTC')
  return toZonedWallClock(result, zone) === requestedWallClock ? result : null
}

export type FormatRow = {
  label: string
  value: string
  live?: boolean
  muted?: boolean
}

export function computeFormats(date: Date, zone: string, now: number = Date.now()): FormatRow[] {
  const resolved = resolveZone(zone)
  const parts = zonedParts(date, zone)
  const day = DAYS[parts.weekday] ?? ''
  return [
    { label: 'Unix (seconds)', value: String(Math.floor(date.getTime() / 1000)) },
    { label: 'Unix (milliseconds)', value: String(date.getTime()) },
    { label: 'ISO 8601', value: date.toISOString() },
    { label: 'RFC 2822', value: date.toUTCString() },
    {
      label: `${resolved} (${zoneOffset(date, zone)})`,
      value: date.toLocaleString(undefined, { timeZone: resolved }),
    },
    { label: `${resolved} — sortable`, value: zonedIsoLike(date, zone) },
    { label: 'UTC', value: date.toUTCString() },
    { label: 'ISO week', value: isoWeek(date, zone), muted: true },
    { label: 'Day', value: day, muted: true },
    { label: 'Relative', value: relativeTime(date, now), live: true },
  ]
}
