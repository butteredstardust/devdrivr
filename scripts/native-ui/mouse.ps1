<#
.SYNOPSIS
  Synthetic mouse driver for native-UI debugging on Windows. Counterpart to mouse.swift.

.DESCRIPTION
  ./mouse.ps1 selftest                    # prove input reaches the desktop — run this first
  ./mouse.ps1 move     <x> <y>
  ./mouse.ps1 click    <x> <y>
  ./mouse.ps1 dblclick <x> <y>
  ./mouse.ps1 drag     <x1> <y1> <x2> <y2>

  Coordinates are physical screen pixels with the origin at the top-left of the primary monitor —
  the same space window.ps1 reports. They are NOT CSS pixels: under display scaling the two differ
  by the scale factor, so compute targets with `window.ps1 button <name>` rather than by hand.

  There is no permission dialog to grant, unlike macOS Accessibility, but synthetic input is
  silently discarded when the target process runs at a higher integrity level than this shell
  (UIPI) — typically the app launched elevated and the harness did not. `selftest` catches that,
  along with a locked session and an open UAC secure desktop. Without it, every result reads as
  "the app ignores clicks".

  Double-click uses two press/release pairs 90ms apart at an identical point. WebView2 derives
  `e.detail === 2` from that timing itself, which is what Tauri's injected drag script
  (tauri-2.x/src/window/scripts/drag.js) keys maximize-on-double-click off.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command,
  [Parameter(Position = 1)][int]$X1,
  [Parameter(Position = 2)][int]$Y1,
  [Parameter(Position = 3)][int]$X2,
  [Parameter(Position = 4)][int]$Y2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'native.psm1') -Force

function Show-Usage {
  (Get-Help -Full $PSCommandPath).Description.Text
  exit 2
}

[void](Initialize-DpiAwareness)

switch ($Command) {
  'selftest' {
    [void](Test-SyntheticInput)
    "synthetic input OK — cursor obeyed and SendInput was accepted"
    "foreground window belongs to: $(Get-ForegroundProcessName)"
  }
  'move' {
    if (-not $PSBoundParameters.ContainsKey('Y1')) { Show-Usage }
    Set-MousePosition -X $X1 -Y $Y1
  }
  'click' {
    if (-not $PSBoundParameters.ContainsKey('Y1')) { Show-Usage }
    Invoke-MouseClick -X $X1 -Y $Y1
  }
  'dblclick' {
    if (-not $PSBoundParameters.ContainsKey('Y1')) { Show-Usage }
    Invoke-MouseClick -X $X1 -Y $Y1 -Count 2
  }
  'drag' {
    if (-not $PSBoundParameters.ContainsKey('Y2')) { Show-Usage }
    Invoke-MouseDrag -FromX $X1 -FromY $Y1 -ToX $X2 -ToY $Y2
  }
  default { Show-Usage }
}
