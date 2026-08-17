#!/usr/bin/env bash
# Window inspection helpers for native-UI debugging on macOS.
#
#   ./window.sh bounds        # x y w h of the front window (top-left origin)
#   ./window.sh minimized     # true | false
#   ./window.sh frontmost     # name of the frontmost application process
#   ./window.sh shot [file]   # raise the window, then screenshot it, scaled to 1200px wide
#   ./window.sh titlebar      # x y w h of the top 44px strip (the title bar)
#   ./window.sh front         # raise the target window above everything else
#   ./window.sh solo          # fail unless exactly one cockpit/devdrivr process is running
#   ./window.sh awake [secs]  # hold the display awake so screencapture keeps working
#
# PROC defaults to the dev binary's process name. Override for a packaged build:
#   PROC=devdrivr ./window.sh bounds
#
# The process name is NOT the product name: `cockpit` is the process, `devdrivr` is the *window*
# title. Targeting `process "devdrivr"` in System Events silently matches nothing, or worse, matches
# an unrelated editor window that happens to have the repo name in its title.
#
# `bounds` locates a window by *process*, but `screencapture -R` photographs whatever is on top at
# those coordinates. Measure one window while another covers it — a packaged build next to a dev
# build, or just the editor you launched from — and you get a truthful rectangle around somebody
# else's pixels. That has produced confident, wrong findings twice: "synthetic clicks are being
# dropped" (the window was behind the editor) and "the corners are square when zoomed" (that was a
# second, older build). Hence `shot` raising the window first, and `solo` as a preflight.
set -euo pipefail

PROC="${PROC:-cockpit}"

front() {
  osascript -e "tell application \"System Events\" to set frontmost of process \"$PROC\" to true"
  # AppKit raises asynchronously; capturing immediately can still catch the old stacking order.
  sleep 1
}

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
  front)
    front
    ;;
  solo)
    # Two builds of the same app are indistinguishable in a screenshot but not in behaviour, and
    # only one of them has your change in it.
    running=$(osascript -e 'tell application "System Events" to return name of every process whose name is "cockpit" or name is "devdrivr"')
    count=$(printf '%s' "$running" | awk -F', ' '{print NF}')
    if [ "$running" = "" ]; then
      echo "no cockpit process running" >&2
      exit 3
    elif [ "$count" -gt 1 ]; then
      echo "more than one build running ($running) — quit all but the one under test" >&2
      exit 3
    fi
    echo "$running"
    ;;
  shot)
    out="${2:-/tmp/native-ui-shot.png}"
    # Wake the display first: a sleeping display makes screencapture emit an all-black PNG or fail
    # with "could not create image from rect", which reads as a broken app rather than a dark screen.
    caffeinate -u -t 2
    front
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
