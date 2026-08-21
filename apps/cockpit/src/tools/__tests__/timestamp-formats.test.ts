import { describe, it, expect } from 'vitest'
import {
  computeFormats,
  fromZonedWallClock,
  isoWeek,
  listTimeZones,
  LOCAL_ZONE,
  resolveZone,
  toZonedWallClock,
  zonedParts,
  zoneOffset,
} from '../timestamp-converter/timestamp-formats'

describe('resolveZone', () => {
  it('turns the sentinel into a real zone and passes others through', () => {
    expect(resolveZone('Europe/Bucharest')).toBe('Europe/Bucharest')
    expect(resolveZone(LOCAL_ZONE)).not.toBe(LOCAL_ZONE)
  })
})

describe('zonedParts', () => {
  it('reads an instant in the requested zone, not the host one', () => {
    // 2021-06-01T12:00:00Z is 15:00 in Bucharest (EEST) and 05:00 in Los Angeles (PDT).
    const date = new Date('2021-06-01T12:00:00Z')
    expect(zonedParts(date, 'Europe/Bucharest').hour).toBe(15)
    expect(zonedParts(date, 'America/Los_Angeles').hour).toBe(5)
  })

  it('normalises a 24 o’clock midnight to 0', () => {
    expect(zonedParts(new Date('2021-06-01T00:00:00Z'), 'UTC').hour).toBe(0)
  })
})

describe('zoneOffset', () => {
  it('renders a plain UTC offset', () => {
    expect(zoneOffset(new Date('2021-06-01T12:00:00Z'), 'UTC')).toBe('UTC+00:00')
  })

  it('tracks daylight saving rather than assuming a fixed offset', () => {
    const winter = zoneOffset(new Date('2021-01-01T12:00:00Z'), 'Europe/Bucharest')
    const summer = zoneOffset(new Date('2021-06-01T12:00:00Z'), 'Europe/Bucharest')
    expect(winter).toBe('UTC+02:00')
    expect(summer).toBe('UTC+03:00')
  })
})

describe('isoWeek', () => {
  it('uses the week-numbering year, not the calendar year', () => {
    // The case that makes this worth a function: 1 Jan 2021 belongs to week 53 of 2020.
    expect(isoWeek(new Date('2021-01-01T12:00:00Z'), 'UTC')).toBe('2020-W53')
  })

  it('numbers a mid-year date correctly', () => {
    expect(isoWeek(new Date('2021-06-01T12:00:00Z'), 'UTC')).toBe('2021-W22')
  })

  it('puts 4 January in week 1 every year', () => {
    expect(isoWeek(new Date('2021-01-04T12:00:00Z'), 'UTC')).toBe('2021-W01')
  })
})

describe('wall-clock round trip', () => {
  it('round-trips an ordinary instant', () => {
    const date = new Date('2021-06-01T12:00:00Z')
    const wall = toZonedWallClock(date, 'Europe/Bucharest')
    expect(wall).toBe('2021-06-01T15:00:00')
    expect(fromZonedWallClock(wall, 'Europe/Bucharest')?.toISOString()).toBe(date.toISOString())
  })

  it('round-trips across a DST boundary', () => {
    // An hour after Europe/Bucharest springs forward — the case where a fixed-offset conversion is
    // an hour out and the second solving pass is what saves it.
    const date = new Date('2021-03-28T02:00:00Z')
    const wall = toZonedWallClock(date, 'Europe/Bucharest')
    expect(fromZonedWallClock(wall, 'Europe/Bucharest')?.toISOString()).toBe(date.toISOString())
  })

  it('returns null for unparseable input instead of jumping to 1970', () => {
    expect(fromZonedWallClock('not a date', 'UTC')).toBeNull()
  })

  it('rejects a wall time skipped by daylight saving', () => {
    expect(fromZonedWallClock('2021-03-28T03:30:00', 'Europe/Bucharest')).toBeNull()
  })
})

describe('listTimeZones', () => {
  it('returns a non-empty list of IANA names', () => {
    // Note `Intl.supportedValuesOf` does not include the bare `UTC` alias — it lists `Etc/UTC`.
    // The picker adds UTC as its own entry above the separator, so nothing here needs to.
    const zones = listTimeZones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones).toContain('Europe/Bucharest')
  })
})

describe('computeFormats', () => {
  const date = new Date('2021-06-01T12:00:00Z')

  it('includes the unix, ISO week and relative rows', () => {
    const labels = computeFormats(date, 'UTC', date.getTime()).map((r) => r.label)
    expect(labels).toContain('Unix (seconds)')
    expect(labels).toContain('ISO week')
    expect(labels).toContain('Relative')
  })

  it('names the resolved zone and its offset in the zoned row', () => {
    const rows = computeFormats(date, 'Europe/Bucharest', date.getTime())
    expect(rows.some((r) => r.label === 'Europe/Bucharest (UTC+03:00)')).toBe(true)
    expect(rows.find((r) => r.label === 'Europe/Bucharest — sortable')?.value).toBe(
      '2021-06-01 15:00:00'
    )
  })

  it('marks only the relative row as live', () => {
    const rows = computeFormats(date, 'UTC', date.getTime())
    expect(rows.filter((r) => r.live).map((r) => r.label)).toEqual(['Relative'])
  })
})
