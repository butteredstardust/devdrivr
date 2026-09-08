import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the split window configuration.
 *
 * Tauri merges `tauri.macos.conf.json` into `tauri.conf.json` as an RFC 7396 merge patch, and a
 * merge patch replaces an array outright instead of merging its members. `app.windows` is an
 * array, so the macOS file has to repeat every setting of the base window — a size or minimum
 * added to one file and not the other silently applies on one platform only.
 */
const SRC_TAURI = resolve(__dirname, '../../../src-tauri')

interface WindowConfig extends Record<string, unknown> {
  decorations?: boolean
  titleBarStyle?: string
  hiddenTitle?: boolean
  trafficLightPosition?: { x: number; y: number }
}

function windowConfig(file: string): WindowConfig {
  const config = JSON.parse(readFileSync(resolve(SRC_TAURI, file), 'utf8')) as {
    app: { windows: WindowConfig[] }
  }
  expect(config.app.windows).toHaveLength(1)
  return config.app.windows[0]!
}

const base = windowConfig('tauri.conf.json')
const mac = windowConfig('tauri.macos.conf.json')

/** Settings the macOS window is meant to state differently. Everything else must match. */
const MAC_ONLY_KEYS = new Set([
  'decorations',
  'titleBarStyle',
  'hiddenTitle',
  'trafficLightPosition',
])

describe('macOS window override', () => {
  it('repeats every shared setting of the base window', () => {
    const drift = Object.keys(base)
      .filter((key) => !MAC_ONLY_KEYS.has(key))
      .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(mac[key]))
    expect(drift).toEqual([])
  })

  it('adds nothing to the macOS window that the base window is missing', () => {
    const extra = Object.keys(mac).filter((key) => !MAC_ONLY_KEYS.has(key) && !(key in base))
    expect(extra).toEqual([])
  })

  it('keeps the AppKit frame so the window can enter a fullscreen Space', () => {
    // An undecorated AppKit window has no green button, no Space, and no rounded corners. Overlay
    // keeps the frame and hides only the title bar, which is what puts the traffic lights on the
    // app's own title bar.
    expect(mac.decorations).toBe(true)
    expect(mac.titleBarStyle).toBe('Overlay')
    expect(mac.hiddenTitle).toBe(true)
    // Required by Tauri: the inset is honoured only with Overlay and decorations enabled.
    expect(mac.trafficLightPosition).toEqual({ x: 12, y: 24 })
  })

  it('leaves Windows and Linux undecorated, where the app draws its own controls', () => {
    expect(base.decorations).toBe(false)
  })
})
