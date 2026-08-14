/**
 * On-screen debug probe for native-UI testing of the Tauri window.
 *
 * NOT part of the build. Copy it into `src/app/__DebugProbe.tsx`, mount it from `App.tsx`, and
 * delete both when finished:
 *
 *   cp scripts/native-ui/DebugProbe.tsx src/app/__DebugProbe.tsx
 *   # in src/app/App.tsx: import { DebugProbe } from './__DebugProbe'
 *   #                     render <DebugProbe /> just before the closing </div>
 *
 * Why an on-screen overlay instead of the console: the dev window has no devtools available to the
 * agent driving it, and stdout from the webview does not reach the terminal reliably. Rendering the
 * log into the DOM makes it readable by `screencapture`, which is the only channel that always
 * works. Keep it high-contrast — the crop gets scaled down before it's read.
 *
 * It answers three questions that native window bugs keep raising:
 *
 *   1. What did the click actually hit? A full-screen scrim from an open panel absorbing events
 *      is indistinguishable from "the button is broken" unless you print the event target.
 *   2. Did a promise reject? Window calls written as `void win.minimize()` swallow every error.
 *   3. Is IPC still alive? This is the important one. Tauri's *plugin* command dispatch
 *      (`plugin:window|*`, `plugin:sql|*`) can deadlock independently of custom
 *      `#[tauri::command]` handlers, so the app keeps looking healthy while it has silently
 *      stopped persisting anything to SQLite. The timed pass below shows both lanes side by side.
 *
 * Keep the poll interval slow and the command list short: probing an already-wedged queue adds
 * traffic to it and muddies the reading.
 */
import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const MAX_LINES = 18
const IPC_POLL_MS = 4000
const IPC_TIMEOUT_MS = 3000

/** Custom handler vs. two plugin lanes — the split is what makes the deadlock visible. */
const IPC_PROBES: Array<[label: string, command: string, args?: Record<string, unknown>]> = [
  ['custom', 'get_platform_info'],
  ['win', 'plugin:window|scale_factor'],
  ['sql', 'plugin:sql|load', { db: 'sqlite:cockpit.db' }],
]

function describe(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target)
  const drag = target.hasAttribute('data-tauri-drag-region') ? ' DRAG' : ''
  const id = target.getAttribute('data-testid')
  const cls = target.className?.toString().slice(0, 60) ?? ''
  return `${target.tagName}${drag}${id ? ` #${id}` : ''} {${cls}}`
}

export function DebugProbe() {
  const [lines, setLines] = useState<string[]>([])
  const push = useRef((line: string) => {
    const stamp = new Date().toISOString().slice(14, 23)
    setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), `${stamp} ${line}`])
  })

  useEffect(() => {
    const log = push.current

    const onPointer = (event: Event) => {
      const mouse = event as MouseEvent
      const top = document.elementFromPoint(mouse.clientX, mouse.clientY)
      log(
        `${event.type} d=${mouse.detail} @${Math.round(mouse.clientX)},${Math.round(mouse.clientY)}` +
          ` tgt=${describe(event.target)} top=${describe(top)}`
      )
    }

    const events = ['pointerdown', 'mousedown', 'mouseup', 'click', 'pointerup']
    for (const name of events) {
      document.addEventListener(name, onPointer, true)
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      log(`UNHANDLED REJECTION: ${String(event.reason)}`)
    }
    window.addEventListener('unhandledrejection', onRejection)

    let stopped = false
    const runProbes = async () => {
      for (const [label, command, args] of IPC_PROBES) {
        const started = performance.now()
        const timeout = new Promise<string>((resolve) =>
          setTimeout(() => resolve(`>${IPC_TIMEOUT_MS}ms NO RESPONSE`), IPC_TIMEOUT_MS)
        )
        const call = invoke(command, args ?? {})
          .then(() => `${Math.round(performance.now() - started)}ms OK`)
          .catch((err) => `${Math.round(performance.now() - started)}ms ERR ${String(err)}`)
        const result = await Promise.race([call, timeout])
        if (stopped) return
        log(`ipc ${label}: ${result}`)
      }
    }

    void runProbes()
    const timer = setInterval(() => void runProbes(), IPC_POLL_MS)

    return () => {
      stopped = true
      clearInterval(timer)
      for (const name of events) {
        document.removeEventListener(name, onPointer, true)
      }
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
        background: '#000',
        color: '#0f0',
        font: '11px/1.35 ui-monospace, monospace',
        padding: '4px 6px',
        whiteSpace: 'pre-wrap',
      }}
    >
      {lines.join('\n')}
    </div>
  )
}
