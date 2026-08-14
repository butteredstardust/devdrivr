#!/usr/bin/env bash
# Window inspection helpers for native-UI debugging on macOS.
#
#   ./window.sh bounds        # x y w h of the front window (top-left origin)
#   ./window.sh minimized     # true | false
#   ./window.sh frontmost     # name of the frontmost application process
#   ./window.sh shot [file]   # screenshot cropped to the window, scaled to 1200px wide
#   ./window.sh titlebar      # x y w h of the top 44px strip (the title bar)
#   ./window.sh awake [secs]  # hold the display awake so screencapture keeps working
#
# PROC defaults to the dev binary's process name. Override for a packaged build:
#   PROC=devdrivr ./window.sh bounds
#
# The process name is NOT the product name: `cockpit` is the process, `devdrivr` is the *window*
# title. Targeting `process "devdrivr"` in System Events silently matches nothing, or worse, matches
# an unrelated editor window that happens to have the repo name in its title.
set -euo pipefail

PROC="${PROC:-cockpit}"

bounds() {
  osascript -e "tell application \"System Events\" to tell process \"$PROC\"
    set p to position of window 1
    set s to size of window 1
    return (item 1 of p as string) & \" \" & (item 2 of p as string) & \" \" & (item 1 of s as string) & \" \" & (item 2 of s as string)
  end tell"
}

case "${1:-}" in
  bounds)
    bounds
    ;;
  titlebar)
    # shellcheck disable=SC2046
    set -- $(bounds)
    echo "$1 $2 $3 44"
    ;;
  minimized)
    osascript -e "tell application \"System Events\" to tell process \"$PROC\" to return value of attribute \"AXMinimized\" of window 1"
    ;;
  frontmost)
    osascript -e 'tell application "System Events" to return name of first application process whose frontmost is true'
    ;;
  shot)
    out="${2:-/tmp/native-ui-shot.png}"
    # Wake the display first: a sleeping display makes screencapture emit an all-black PNG or fail
    # with "could not create image from rect", which reads as a broken app rather than a dark screen.
    caffeinate -u -t 2
    # shellcheck disable=SC2046
    set -- $(bounds)
    screencapture -x -o -R "$1,$2,$3,$4" "$out"
    sips -Z 1200 "$out" >/dev/null
    echo "$out"
    ;;
  awake)
    caffeinate -dis -t "${2:-900}" &
    echo "display held awake for ${2:-900}s (pid $!)"
    ;;
  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
