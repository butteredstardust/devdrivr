#!/usr/bin/env bash
# Dev with a browser-drivable copy of the app. See src-tauri/src/remote_ui.rs for the why.
#
# Two build outputs run side by side, on purpose:
#   - `tauri dev` puts the native window on the Vite dev server (:1420), with HMR, as usual.
#   - `vite build --watch` keeps ../dist fresh, because the remote-ui server reads static files off
#     disk and cannot proxy a dev server. That is the copy the browser at :9090 loads.
# Both talk to the same app process, so the browser session sees the real database and filesystem.
#
# Built in development mode with sourcemaps rather than as a production bundle: the point of the
# exercise is to be able to read a stack trace and a React component name.
set -euo pipefail

COCKPIT_REMOTE_UI=1 bunx vite build --watch --mode development --sourcemap &
VITE_PID=$!
# Without this the watcher outlives Ctrl-C and quietly keeps rewriting dist/ under the next run.
trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT INT TERM

bunx tauri dev --features remote-ui
