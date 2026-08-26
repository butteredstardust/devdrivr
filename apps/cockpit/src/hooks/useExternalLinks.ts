import { useEffect } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

/** Schemes worth handing to the OS. Anything else (`file:`, `javascript:`, …) is left alone. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * Sends in-app links to the user's browser instead of this webview.
 *
 * A desktop webview has no back button. Following a link in place — from the Markdown preview, a
 * note, a docs panel — replaces the entire app with a web page and leaves no way back short of
 * restarting it. Rendered Markdown makes that trivially easy to hit, since anchors come straight
 * from user content.
 *
 * Bubble phase, not capture: React's own handlers run first that way, so a surface that already
 * claimed the click (the Markdown preview starting a block edit on a paragraph containing a link)
 * has set `defaultPrevented` and is skipped here. Capture-phase would open the browser out from
 * under it.
 */
export function useExternalLinks(): void {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      const target = event.target
      // `window.HTMLElement`, not the bare global: the test harness attaches jsdom to `window`
      // only, and a bare reference throws there. Matches MarkdownPreview's delegation checks.
      if (!(target instanceof window.HTMLElement)) return
      const anchor = target.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      // In-page anchors (a Markdown table of contents, say) must keep scrolling the document.
      if (!href || href.startsWith('#')) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (!EXTERNAL_PROTOCOLS.has(url.protocol)) return

      // Same-origin means the app's own bundle, never a destination: navigating there swaps the
      // running app for a dev-server page or a 404. Block it without opening anything.
      event.preventDefault()
      if (url.protocol !== 'mailto:' && url.origin === window.location.origin) return

      void openUrl(url.href).catch(() => {
        // Nothing useful to do if the OS refuses: the navigation is already blocked, which is the
        // part that would otherwise cost the user their session.
      })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
}
